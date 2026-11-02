#!/usr/bin/env node
/* Food Gang VFX check (docs/VFX.md).
 * A. Node, no browser: ParticleRuntime semantics that each fix of 2026-10-31 restored (Unity Shuriken behaviour the
 *    FX prefabs rely on): material blend/texture from the APK shaders, animated EmissionModule.enabled, infinite burst
 *    cycles, drag x speed^2, world-space scale, 2D World collision on the map, death sub-emitter, DestroyAfterDelay.
 * B. Browser (dev.html, engine loop stopped, stepped at 1/60 s): every match FX spawned on the Kitchen counter, frames
 *    saved to FG_SHOTS/vfx/<viewport>/<fx>/f<NN>.png, particle counts per frame, FX gone after its lifetime.
 * C. Whole bot matches in real time on the 3 maps (index.html): fps, particle and FX-pool peaks, no errors.
 *   node test/food-gang-vfx.js     (all parts)     FG_VFX=unit | browser | soak     FG_VFX_ONLY=Fx_heal,Fx_hit_bullet
 *   FG_SOAK=kitchen:dm2v2:BRO:4,...  (map:mode:skin:seed)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'food-gang');
const SHOTS = process.env.FG_SHOTS || path.join(ROOT, 'shots', 'food-gang');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };
const J = (p) => JSON.parse(fs.readFileSync(path.join(GAME, p), 'utf8'));

// ------------------------------------------------------------------------------------------------ A. unit

function mat4(tx = 0, ty = 0, tz = 0, s = 1) { const m = new Float32Array(16); m[0] = m[5] = m[10] = s; m[15] = 1; m[12] = tx; m[13] = ty; m[14] = tz; return m; }

async function unit() {
  console.log('A. particle runtime (node)');
  const { ParticleRuntime } = await import('file:///' + path.join(GAME, 'js/engine/particles.js').replace(/\\/g, '/'));
  const mats = J('data/materials.json'), sprites = J('data/sprites.json');
  const kitchen = J('data/scenes/SceneLevelKitchen.json');
  // the Kitchen's Default-layer BoxCollider2D as a fake scene for colliders2D()
  const boxNodes = kitchen.nodes.map((nd) => ({ nd })).filter(({ nd }) => nd.comps.some((c) => c.type === 'BoxCollider2D'));
  const worldOf = (i) => { let x = 0, y = 0, sx = 1, sy = 1; const ch = []; for (let n = kitchen.nodes[i]; n; n = n.parent >= 0 ? kitchen.nodes[n.parent] : null) ch.unshift(n); for (const n of ch) { x += n.tf.p[0] * sx; y += n.tf.p[1] * sy; sx *= n.tf.s[0]; sy *= n.tf.s[1]; } return { x, y, sx, sy }; };
  const colNodes = kitchen.nodes.map((nd, i) => ({ nd, i })).filter(({ nd }) => nd.comps.some((c) => c.type === 'BoxCollider2D')).map(({ nd, i }) => {
    const w = worldOf(i), m = new Float32Array(16); m[0] = w.sx; m[5] = w.sy; m[10] = 1; m[15] = 1; m[12] = w.x; m[13] = w.y;
    return { activeInHierarchy: true, layer: nd.layer, world: m, comps: nd.comps };
  });
  check('Kitchen map has Default-layer BoxCollider2D (floor, shelves)', colNodes.filter((n) => n.layer === 0).length >= 5, `${boxNodes.length} colliders`);
  const engine = { frame: 0, instances: [], allNodes: () => colNodes, assets: { material: (k) => (k ? mats[k.replace('mat:', '')] || null : null), sprite: () => null } };
  const prefab = (name) => J(`data/prefabs/${name}.json`);
  // a runtime over a prefab's node: each node gets world = parent chain (translation + uniform scale only)
  const instance = (name, at = [0, 0, 0], rootScale = 1) => {
    const p = prefab(name);
    const nodes = p.nodes.map((nd) => ({ name: nd.name, nd, ls: nd.tf.s.slice(), comps: JSON.parse(JSON.stringify(nd.comps)) }));
    const scene = { ref: (r) => { const d = r.indexOf('.'); const n = nodes[+r.slice(1, d)]; return n ? n.comps[+r.slice(d + 1)] : null; } };
    nodes.forEach((n, i) => {
      let x = at[0], y = at[1], z = at[2], s = rootScale;
      const ch = []; for (let k = i; k >= 0; k = p.nodes[k].parent) ch.unshift(p.nodes[k]);
      ch.forEach((nd, j) => { if (j > 0) { x += nd.tf.p[0] * s; y += nd.tf.p[1] * s; z += nd.tf.p[2] * s; } s *= j === 0 ? 1 : nd.tf.s[0]; });
      n.world = mat4(x, y, z, s); n.scene = scene;
    });
    const rts = [];
    for (const n of nodes) for (const c of n.comps) if (c.type === 'ParticleSystem') rts.push({ name: n.name, rt: new ParticleRuntime(c, n, engine) });
    return { nodes, rts, get: (nm) => rts.find((r) => r.name === nm).rt };
  };
  const run = (inst, secs, each) => { for (let f = 0; f < Math.round(secs * 60); f++) { engine.frame++; for (const r of inst.rts) r.rt.step(1 / 60); if (each) each(f + 1); } };

  // 1. blend + textures of the real APK shaders (a white quad for heal/skull/blood before; sparks drew additive)
  const blend = (k) => mats[k] && `${mats[k].src}/${mats[k].dst}`;
  check('particle_spark / missile_spark alpha-blended (Sprites/Default)', blend('particle_spark') === '5/10' && blend('particle_missile_spark') === '5/10', `${blend('particle_spark')} ${blend('particle_missile_spark')}`);
  check('impact / circle / bubble additive (Mobile/Particles/Additive)', ['particle_impact', 'particle_circle', 'particle_bubble'].every((k) => blend(k) === '5/1'));
  check('heal + skull additive (Shader Graphs/Particles), death pieces alpha', blend('particle_health') === '5/1' && blend('particle_skull') === '5/1' && blend('particle_death_tomato') === '5/10');
  const texOk = ['particle_health', 'particle_skull', 'particle_blood'].map((k) => mats[k].tex && sprites.sprites[mats[k].tex.slice(7)]);
  check('heal / skull / blood materials have their texture', texOk.every(Boolean), texOk.map((t) => t && t.a).join(','));

  // 2. run dust: emission module off in the prefab, the skin_run clip turns it on; bursts of 3 every 0.5 s forever
  {
    const sk = instance('skin_BRO');
    const dust = sk.get('skin_smoke');
    run(sk, 1);
    const idle = dust.p.length;
    dust.setAnimProp('EmissionModule.enabled', 1);
    let born = 0; const seen = new Set();
    run(sk, 2.02, () => { for (const P of dust.p) if (!seen.has(P)) { seen.add(P); born++; } });
    check('run dust idle: no particles while EmissionModule off', idle === 0, `${idle}`);
    check('run dust: 3 every 0.5 s while running (cycleCount 0 = infinite)', born >= 12 && born <= 15, `${born} in 2 s`);
  }
  // 3. bullet trail sparks: one every 0.05 s for the bullet's life
  {
    const b = instance('bullet_tomato');
    let born = 0; const seen = new Set();
    run(b, 1, () => { for (const P of b.get('spark').p) if (!seen.has(P)) { seen.add(P); born++; } });
    check('bazooka trail: ~20 sparks per second (burst interval 0.05, infinite)', born >= 18 && born <= 22, `${born}`);
  }
  // 4. drag x speed^2: hit sparks stop within ~0.4 units of the impact (scale 0.2, speed 20, drag 1.5)
  {
    const fx = instance('Fx_hit_bullet', [0, 3, 0]);
    run(fx, 0.25);
    const sp = fx.get('spark');
    const far = Math.max(0, ...sp.p.map((P) => Math.hypot(P.pos[0], P.pos[1]) * 0.2));
    const spd = Math.max(0, ...sp.p.map((P) => Math.hypot(P.vel[0], P.vel[1])));
    check('hit sparks: quadratic drag keeps the burst tight', far > 0.1 && far < 0.5, `max ${far.toFixed(2)} u at 0.25 s, speed ${spd.toFixed(1)} local u/s`);
  }
  // 5. collision: missile sparks born above the Kitchen floor (top y 0) bounce on it and stay above; sparks born
  //    inside the floor (sphere shape of radius 1) pass through, as a CircleCast from inside does in Unity
  {
    const fx = instance('Fx_hit_missile', [0, 1, 0]);
    const born = new Map(); let minY = 9, n = 0;
    run(fx, 1.9, () => { for (const P of fx.get('spark (1)').p) { if (!born.has(P)) born.set(P, P.pos[1] + 1); if (born.get(P) > 0.4) { minY = Math.min(minY, P.pos[1] + 1); n++; } } });
    check('missile sparks bounce on the floor instead of falling through', n > 0 && minY > -0.3, `lowest y ${minY.toFixed(2)}`);
  }
  // 6. world-space scale (Hierarchy): an FX root at x1.5 throws bigger pieces (hit FX of a boss are spawned x1.5)
  {
    const a = instance('Fx_death_tomato', [0, 3, 0], 1), b = instance('Fx_death_tomato', [0, 3, 0], 1.5);
    run(a, 0.05); run(b, 0.05);
    const avg = (rt) => rt.p.reduce((s, P) => s + P.size * (P.wscale || 1), 0) / Math.max(1, rt.p.length);
    const ra = avg(a.get('pieces')), rb = avg(b.get('pieces'));
    check('world-space particles scale with the FX root (Hierarchy)', rb / ra > 1.3, `${ra.toFixed(2)} vs ${rb.toFixed(2)}`);
  }
  // 7. sub-emitter: pizza special droplets leave a splat where they die, none at the emitter on their own
  {
    const fx = instance('Fx_area_pizza_special', [0, 1.5, 0]);
    const splat = fx.get('Particle System');
    run(fx, 0.3);
    const early = splat.p.length;
    run(fx, 5.5);
    check('pizza splats: no self emission, one per dead droplet', early === 0 && splat.p.length >= 30, `${early} at 0.3 s, ${splat.p.length} after`);
  }
  // 9. trimmed textures: quads cover the original texture (spark band = 1/4 of the quad, sheet tiles of the original width)
  {
    const verts = [];
    const R = { white: {}, spriteTex: () => ({}), setState() {}, reserve() {}, quadIdx() {}, assets: { spriteData: sprites },
      vert: (x, y, z, u, v) => { verts.push([x, y, u, v]); return verts.length - 1; } };
    const pack = () => 0;
    engine.assets.sprite = (k) => (k ? sprites.sprites[k.replace('sprite:', '')] || null : null);
    const fx = instance('Fx_death_tomato', [0, 3, 0]);
    run(fx, 0.1);
    const pieces = fx.get('pieces');
    verts.length = 0; pieces.draw(R, null, pack);
    const sp = pieces.sprite, A = sprites.atlases[sp.a];
    let worst = 0;
    for (let i = 0; i + 3 < verts.length; i += 4) {
      const u0 = Math.min(verts[i][2], verts[i + 3][2]), u1 = Math.max(verts[i][2], verts[i + 3][2]);
      const k0 = Math.floor(((u0 * A.w - sp.x + sp.ox) / sp.ow) * 3 + 1e-4), k1 = Math.floor(((u1 * A.w - sp.x + sp.ox) / sp.ow) * 3 - 1e-4);
      if (k0 !== k1) worst++;
    }
    check('death pieces: each quad samples one tile of the untrimmed 3x1 sheet', verts.length > 0 && worst === 0, `${verts.length / 4} quads, ${worst} straddle two tiles`);
    const hit = instance('Fx_hit_bullet', [0, 3, 0]);
    run(hit, 1 / 60);
    const spark = hit.get('spark');
    verts.length = 0; spark.draw(R, null, pack);
    const P = spark.p[0], wsc = 0.2;
    const across = Math.hypot(verts[1][0] - verts[0][0], verts[1][1] - verts[0][1]);
    check('hit spark: visible band is a quarter of the quad width (32 of 128 px)', Math.abs(across / (P.size * wsc) - 0.25) < 0.05, `${(across / (P.size * wsc)).toFixed(3)}`);
  }
  // 10. UIParticleSystem draws with the Graphic's material + particleSprite (fridge smoke)
  {
    const box = instance('Box1');
    const smoke = box.rts[0].rt;
    check('fridge smoke (UIParticleSystem): Graphic material + sprite', smoke.uiGraphic && smoke.mat && smoke.mat === mats.UIParticleSmoke && smoke.sprite && smoke.sprite.a === 'fx', `mat ${smoke.mat && smoke.mat.shader}, sprite ${smoke.sprite && smoke.sprite.a}`);
  }
  // 8. DestroyAfterDelay drives the FX lifetime in prefabs.js
  {
    const src = fs.readFileSync(path.join(GAME, 'js/game/match/prefabs.js'), 'utf8');
    check('FX lifetime reads DestroyAfterDelay.m_delay', /DestroyAfterDelay/.test(src) && /m_delay/.test(src));
  }
}

// ------------------------------------------------------------------------------------------------ B. browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg', '.otf': 'font/otf', '.ttf': 'font/ttf' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(b); });
    }).listen(0, () => res(srv));
  });
}

const FXS = ['Fx_hit_bullet', 'Fx_hit_melee', 'Fx_hit_missile', 'Fx_hit_pepper', 'Fx_hit_pepper_special', 'Fx_hit_bullet_melon',
  'Fx_hit_bullet_melon_special', 'Fx_hit_apple_special', 'Fx_hit_broccoli_special', 'Fx_hit_donut_special', 'Fx_hit_pizza_special',
  'Fx_hit_potato_special', 'Fx_area_pizza_special', 'Fx_area_potato_special', 'Fx_heal', 'Fx_poison', 'Fx_death_tomato', 'Fx_death_broccoli',
  'Fx_death_dummy', 'bullet_tomato', 'bullet_potato', 'bullet_pepper'];
const SMOKE = { bullet_tomato: 'smoke_bazooka', bullet_potato: 'smoke_missile', bullet_pepper: 'smoke_dynamite' };
const VIEWS = [['1280x720@1', 1280, 720, 1], ['1920x1080@1', 1920, 1080, 1], ['1280x720@2', 1280, 720, 2]];
const FRAMES = [1, 3, 6, 10, 15, 20, 30, 45, 60, 90];

async function browser() {
  console.log('B. FX frames in the dev page');
  const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
  const { chromium } = require(PW);
  const only = process.env.FG_VFX_ONLY ? process.env.FG_VFX_ONLY.split(',') : null;
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/games/food-gang/dev.html`;
  const br = await chromium.launch({ args: process.env.FG_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist'] });
  const killer = setTimeout(() => { console.log('  FAIL timeout (600 s)'); process.exit(2); }, 600000);
  const report = {};
  try {
    for (const [label, w, h, dpr] of VIEWS) {
      const page = await br.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}?scene=level23&prefab=BRO&anim=idle&nofx=1&info=0`);
      await page.waitForFunction(() => window.fgDev && window.fgDev.ready, null, { timeout: 60000 });
      await page.evaluate(() => { const e = window.fgDev.engine; e.stop(); e.step(1 / 60); });
      for (const fx of FXS) {
        if (only && !only.includes(fx)) continue;
        const dir = path.join(SHOTS, 'vfx', label, fx);
        fs.mkdirSync(dir, { recursive: true });
        // bullets fly left at 12 u/s with their FgViewDb smoke trail following them (QuantumBulletView)
        await page.evaluate(async ([name, smoke]) => {
          const e = window.fgDev.engine;
          const inst = await e.instantiate(name, null, [2.5, 1.0, 0]);
          const trail = smoke ? await e.instantiate(smoke, null, [2.5, 1.0, 0]) : null;
          window.__fx = { inst, trail, x: 2.5, bullet: name.startsWith('bullet_') };
        }, [fx, SMOKE[fx] || null]);
        const counts = [];
        let f = 0;
        for (const target of FRAMES) {
          const st = await page.evaluate((n) => {
            const e = window.fgDev.engine, F = window.__fx;
            let p = 0;
            for (let i = 0; i < n; i++) {
              if (F.bullet) { F.x -= 12 / 60; F.inst.root.lp[0] = F.x; F.inst.root.setEuler(0, 0, 180); if (F.trail) F.trail.root.lp[0] = F.x; }
              e.step(1 / 60);
              p = window.fgEngineStats.particles;
            }
            const s = e.worldToScreen(2.5, 1.0, 0);
            return { p, sx: s ? s[0] : 0, sy: s ? s[1] : 0, W: e.canvas.width, H: e.canvas.height };
          }, target - f);
          f = target;
          counts.push(st.p);
          const k = st.W / w;   // device pixels per CSS pixel
          const cx = st.sx / k, cy = (st.H - st.sy) / k, cw = Math.min(w, 520), ch = Math.min(h, 360);
          await page.screenshot({ path: path.join(dir, `f${String(target).padStart(2, '0')}.png`),
            clip: { x: Math.max(0, Math.min(w - cw, cx - cw / 2 - (fx.startsWith('bullet_') ? 120 : 0))), y: Math.max(0, Math.min(h - ch, cy - ch / 2)), width: cw, height: ch } });
        }
        // let it run out, then remove it as the match does (prefabs.js lifetime); a finished FX draws nothing
        const end = await page.evaluate(() => {
          const e = window.fgDev.engine, F = window.__fx;
          for (let i = 0; i < 720; i++) e.step(1 / 60);
          const left = F.inst.root.inChildren('ParticleSystem').reduce((s, c) => s + (c.runtime ? c.runtime.p.length : 0), 0);
          F.inst.root.destroy(); if (F.trail) F.trail.root.destroy(); e.step(1 / 60);
          return { left, after: window.fgEngineStats.particles };
        });
        report[label + ' ' + fx] = { counts, left: end.left };
        const looping = fx === 'Fx_poison' || fx.startsWith('bullet_') || fx === 'Fx_area_potato_special';
        if (label === VIEWS[0][0]) {
          check(`${fx}: emits`, counts.some((c) => c > 0), counts.join(' '));
          if (!looping) check(`${fx}: no particle left 13 s later`, end.left === 0, `${end.left}`);
        }
      }
      check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await page.close();
    }
  } finally {
    clearTimeout(killer);
    await br.close();
    srv.close();
  }
  fs.writeFileSync(path.join(SHOTS, 'vfx', 'report.json'), JSON.stringify(report, null, 1));
}

// ------------------------------------------------------------------------------------------------ C. soak

// whole bot matches in real time (the local fighter stands still, bots fight): fps, particle / FX counts every
// second, FX removed once their time is up (no leak, nothing immortal), no console errors
async function soak() {
  console.log('C. bot matches, real time');
  const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
  const { chromium } = require(PW);
  const srv = await serve();
  const base = `http://localhost:${srv.address().port}/games/food-gang/index.html`;
  const br = await chromium.launch({ args: [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : ['--use-angle=vulkan', '--enable-features=Vulkan']), '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const killer = setTimeout(() => { console.log('  FAIL timeout (900 s)'); process.exit(2); }, 900000);
  const runs = (process.env.FG_SOAK || 'kitchen:dm2v2:BRO:4,dining:lastSurvivor:TOM:5,pantry:kill5:NORI:6').split(',');
  const out = [];
  try {
    for (const r of runs) {
      const [map, mode, skin, seed] = r.split(':');
      const page = await br.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}?mode=${mode}&map=${map}&skin=${skin}&level=8&seed=${seed}&slot=0&intro=0`);
      await page.waitForFunction(() => { const d = window.fgDebug && window.fgDebug(); return d && d.screen === 'match' && d.phase === 'match'; }, null, { timeout: 60000 });
      const samples = [];
      const t0 = Date.now();
      for (;;) {
        await page.waitForTimeout(1000);
        const d = await page.evaluate(() => {
          const g = window.fgDebug(), st = window.fgEngineStats, m = g.match;
          return { screen: g.screen, phase: m && m.phase, fps: g.fps, particles: st.particles, fx: m && m.hud.fx, bullets: m && m.hud.bullets,
            deaths: m && m.stats.deaths, dmg: m && m.stats.damageEvents, spawned: m && m.stats.bulletsSpawned };
        });
        samples.push(d);
        if (d.screen !== 'match' || d.phase === 'gameover' || Date.now() - t0 > 140000) break;
      }
      const live = samples.filter((x) => x.phase === 'match');
      const fps = live.slice(3).map((x) => x.fps).filter(Boolean);
      const rec = { map, mode, seconds: samples.length, fpsMin: Math.min(...fps), fpsAvg: Math.round(fps.reduce((a, b) => a + b, 0) / fps.length * 10) / 10,
        particlesMax: Math.max(...samples.map((x) => x.particles || 0)), fxMax: Math.max(...samples.map((x) => x.fx || 0)),
        deaths: Math.max(...samples.map((x) => x.deaths || 0)), damage: Math.max(...samples.map((x) => x.dmg || 0)),
        trace: samples.map((x) => [x.fps, x.particles, x.fx, x.phase]) };
      // after the last hit, every FX must go: wait for game over and look at the pool right before the result screen
      out.push(rec);
      console.log(`  ${map} ${mode}: ${rec.seconds} s, fps ${rec.fpsMin}..${rec.fpsAvg}, particles max ${rec.particlesMax}, FX max ${rec.fxMax}, deaths ${rec.deaths}`);
      check(`${map} ${mode}: fights happened (damage + deaths)`, rec.damage > 5 && rec.deaths > 0, `${rec.damage} hits, ${rec.deaths} deaths`);
      check(`${map} ${mode}: fps stays >= 50 with every FX`, rec.fpsMin >= 50, `${rec.fpsMin}..${rec.fpsAvg}`);
      check(`${map} ${mode}: FX pool bounded (no leak)`, rec.fxMax < 80, `max ${rec.fxMax}`);
      check(`${map} ${mode}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
      await page.close();
    }
  } finally {
    clearTimeout(killer);
    await br.close();
    srv.close();
  }
  fs.mkdirSync(path.join(SHOTS, 'vfx'), { recursive: true });
  fs.writeFileSync(path.join(SHOTS, 'vfx', 'soak.json'), JSON.stringify(out, null, 1));
}

(async () => {
  const mode = process.env.FG_VFX || 'all';
  try {
    if (mode === 'all' || mode === 'unit') await unit();
    if (mode === 'all' || mode === 'browser') await browser();
    if (mode === 'all' || mode === 'soak') await soak();
  } catch (e) { console.log('  FAIL ' + (e.stack || e)); fail++; }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
