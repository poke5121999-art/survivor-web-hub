// Plays stages in the real page at both phone sizes, screenshots key moments, a zoo of all 24 enemy kinds and all
// 13 heroes, and asserts the view invariants (no console problems, render scale floor, heroes and enemies on screen).
// Usage: PLAYWRIGHT_PATH=... timeout 600 node games/ai-sinh-ton/tools/view-shots.mjs [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { serve, launch, open as openPage, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', process['env'].CHK_SUB || '', 'view');
fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const ONLYNEW = process.argv.includes('--only-new');
const T0 = Date.now();
const { check, done } = checker();
// the view is judged without the UI kit on top: hide whatever screen the game opened at boot
const open = async (br, base, phone, q, o = {}) => {
  const r = await openPage(br, base, phone, q, { ...o, freeze: true });
  await r.page.evaluate(() => { const G = window.__G; const sc = G && G.screens && G.screens[G.screen]; if (sc && sc.hide) sc.hide(); });
  return r;
};
// the UI kit lives in js/ui (another owner): a missing UI module is not a view problem
const bad = (list) => list.filter((x) => !/Failed to load resource|\/js\/ui\//.test(x));

const ENEMIES = ['walker', 'runner', 'spider', 'flyer', 'hound', 'spitter', 'bloater', 'shielder', 'brute', 'shrieker', 'armored', 'burner', 'frost',
  'giant', 'thrower', 'phantom', 'queen', 'brood', 'vampire', 'alien', 'pharaoh', 'ufo', 'guardian', 'dragon'];
const BOSSES = ['giant', 'thrower', 'phantom', 'queen', 'brood', 'vampire', 'alien', 'pharaoh', 'ufo', 'guardian', 'dragon'];
const HEROES = ['gio', 'thep', 'yta', 'mua', 'bong', 'phao', 'bang', 'hoa', 'sam', 'doc', 'ky', 'soi', 'nhen'];

const shot = async (page, file) => { await page.locator('#frame').screenshot({ path: path.join(OUT, file) }); return path.join(OUT, file); };

// heroes inside the frame, and visible bodies (zombie puppets + horde instances) equal to living sim enemies
const probe = () => {
  const G = window.__G; const H = G.host; const B = G.B; const out = { heroesIn: 0, heroes: 0, alive: 0, visible: 0, phase: B && B.phase, wave: B && B.wave };
  if (!B) return out;
  const v = new H.THREE.Vector3();
  for (const u of B.heroes) {
    out.heroes++;
    const n = G.actors.nodeOf(u.uid); if (!n) continue;
    v.set(n.position.x, 1.2, n.position.z).project(H.camera);
    if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) out.heroesIn++;
  }
  out.alive = B.enemies.filter((e) => e.alive).length;
  out.visible = H.G.zombies.list.filter((z) => z.alive && z.body.root.visible).length + G.actors.horde.stats.units; // puppets + horde instances
  return out;
};

// pixel statistics of a screenshot through PIL: share of pixels between the HUD bands (top bar 40, hero cards from 280 of
// the 360 high landscape frame) that are not the background colour, share of
// clipped white (all channels >= 250), and the mean red-minus-blue around a point given as frame fractions
function pix(file, fogHex, at) {
  const py = `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); fog = int(sys.argv[2], 16); at = json.loads(sys.argv[3])
W, H = im.size; fr = ((fog >> 16) & 255, (fog >> 8) & 255, fog & 255)
px = im.load(); y0 = int(H * 40 / 360); y1 = int(H * 280 / 360); n = 0; fl = 0; wh = 0
for y in range(0, H, 3):
    for x in range(0, W, 3):
        r, g, b = px[x, y]
        if min(r, g, b) >= 250: wh += 1
        if y0 <= y < y1:
            n += 1
            if abs(r - fr[0]) + abs(g - fr[1]) + abs(b - fr[2]) > 36: fl += 1
tot = ((H + 2) // 3) * ((W + 2) // 3)
out = {'floor': fl / max(1, n), 'white': wh / tot}
if at:
    cx = int(at[0] * W); cy = int(at[1] * H); rad = max(4, int(W * 0.02)); s = 0; c = 0
    for y in range(max(0, cy - rad), min(H, cy + rad)):
        for x in range(max(0, cx - rad), min(W, cx + rad)):
            r, g, b = px[x, y]; s += r - b; c += 1
    out['rb'] = s / max(1, c)
print(json.dumps(out))`;
  return JSON.parse(execFileSync('python3', ['-c', py, file, fogHex, JSON.stringify(at || null)]).toString());
}
const FOG = { 3: '1a2634' }; // the scene background of chapter 1 (js/view/themes.js, street)

// resolves with the first sim event matching `pred` (source text), advancing the sim in 0.05 s slices (no real time);
// `limit` is sim seconds. The slice that holds the event runs on to its end, the same way on every run.
const WAIT = () => {
  window.__wait = (kind, predSrc, limit) => {
    const G = window.__G; const pred = new Function('e', 'return (' + predSrc + ')'); let hit = null;
    const off = G.on((e) => { if (!hit && e.e === kind && pred(e)) hit = e; });
    for (let t = 0; t < limit && !hit && G.B && G.B.phase === 'fight'; t += 0.05) window.__sim(0.05);
    if (typeof off === 'function') off();
    return hit;
  };
};
const projFrac = (page, x, z) => page.evaluate(([px, pz]) => { const H = window.__G.host; const v = new H.THREE.Vector3(px, 0, pz).project(H.camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; }, [x, z]);

const srv = await serve();
const br = await launch();
const sheets = { main: [], zoo: [], zooChase: [], heroes: [], ults: [], tele: [], tiers: [] };
try {
  for (const phone of ONLYNEW ? [] : ['s22', 'xiaomi']) {
    // the render scale floor on the low tier, the phone-size check
    {
      const { ctx, page, problems } = await open(br, srv.base, phone, 'autostart=1&stage=3&autoult=1&autopick=1&noaudio=1&q=low&seed=3');
      await page.evaluate(() => window.__sim(6)); await page.evaluate(() => window.__step(3));
      const st = await page.evaluate(() => ({ ...window.__stats }));
      check(st.scale >= 1, `${phone} q=low render scale ${st.scale.toFixed(2)} >= 1`);
      const p = await page.evaluate(probe);
      check(p.heroesIn === p.heroes && p.heroes === 4, `${phone} heroes on screen ${p.heroesIn}/${p.heroes}`);
      check(p.alive === p.visible, `${phone} visible zombies ${p.visible} = living enemies ${p.alive}`);
      await shot(page, `${phone}-low.png`);
      check(bad(problems).length === 0, `${phone} low: no console problems ${problems.slice(0, 2).join(' | ')}`);
      await ctx.close();
    }
    if (QUICK && phone === 's22') continue;
    if (phone === 's22') {
      const w2 = await open(br, srv.base, phone, 'autostart=1&stage=3&autoult=1&autopick=1&noaudio=1&seed=3'); const page = w2.page;
      await page.evaluate(() => { const B = window.__G.B; for (let i = 0; i < 80 && B.wave < 2; i++) window.__sim(1); window.__step(6); });
      // wave 2 of stage 3: hero height from projected feet and head, floor share between the HUD bands
            const hs = await page.evaluate(() => {
        const G = window.__G; const H = G.host; const out = []; const a = new H.THREE.Vector3(); const b = new H.THREE.Vector3();
        for (const u of G.B.heroes) { const n = G.actors.nodeOf(u.uid); a.set(n.position.x, 0, n.position.z).project(H.camera); b.set(n.position.x, 2.7, n.position.z).project(H.camera); out.push(Math.abs(b.y - a.y) / 2 * H.size.h); }
        return { px: out, wave: G.B.wave, R: G.cam.R };
      });
      check(hs.wave === 2 && Math.min(...hs.px) >= 48, `s22 stage 3 wave ${hs.wave}: hero height min ${Math.min(...hs.px).toFixed(1)} px (>= 48), max ${Math.max(...hs.px).toFixed(1)}`);
      const f = await shot(page, 's22-s3-w2.png'); const st = pix(f, FOG[3], null);
      check(st.floor > 0.6, `s22 overview floor share between HUD bands ${(st.floor * 100).toFixed(0)}% (> 60%)`);
      check(st.white < 0.01, `s22 overview clipped white ${(st.white * 100).toFixed(2)}% (< 1%)`);
      await w2.ctx.close();
    }
    // stage 3 from wave 1 on the default tier
    const { ctx, page, problems } = await open(br, srv.base, phone, 'autostart=1&stage=3&autoult=1&autopick=1&noaudio=1&seed=3');
    const moments = [['w1-a', 3], ['w1-b', 12], ['mid', 30], ['mid2', 40]];
    for (const [name, secs] of moments) {
      await page.evaluate((s) => window.__sim(s), secs); await page.evaluate(() => window.__step(4));
      const file = await shot(page, `${phone}-s3-${name}.png`); if (phone === 's22') sheets.main.push(file);
      const p = await page.evaluate(probe);
      check(p.alive === p.visible, `${phone} stage 3 ${name}: visible zombies ${p.visible} = living enemies ${p.alive}`);
    }
    check(bad(problems).length === 0, `${phone} stage 3: no console problems ${problems.slice(0, 2).join(' | ')}`);
    check((await page.evaluate(() => window.__errors.length)) === 0, `${phone} stage 3: __errors empty`);
    await ctx.close();
    // boss waves of stages 1, 5, 7, 20
    for (const s of [1, 5, 7, 20]) {
      const r = await open(br, srv.base, phone, `autostart=1&stage=${s}&wave=5&autoult=1&autopick=1&noaudio=1&seed=${s}`);
      await r.page.evaluate(() => window.__sim(7)); await r.page.evaluate(() => window.__step(4));
      const file = await shot(r.page, `${phone}-boss-s${s}.png`); if (phone === 's22') sheets.main.push(file);
      const p = await r.page.evaluate(probe);
      check(p.heroesIn >= 1 && p.alive === p.visible, `${phone} boss stage ${s}: heroes in frame ${p.heroesIn}, zombies ${p.visible}/${p.alive}`);
      check(bad(r.problems).length === 0 && (await r.page.evaluate(() => window.__errors.length)) === 0, `${phone} boss stage ${s}: no problems ${r.problems.slice(0, 2).join(' | ')}`);
      await r.ctx.close();
    }
  }

  if (!QUICK && !ONLYNEW) {
    // zoo: only one enemy kind spawned, nothing dies, and a chase camera on the first of them
    const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=5');
    await page.evaluate(() => { window.__seen = new Set(); window.__G.on((e) => { if (e.e === 'spawn') window.__seen.add(e.kind); }); });
    for (const kind of ENEMIES) {
      const info = await page.evaluate((k) => {
        const G = window.__G; const base = G.stageDef(1);
        const def = { ...base, hpMul: 1e6, atkMul: 0.0001, bossHp: 1, bossTier: 3, boss: k, waves: [{ groups: [{ kind: k, n: 3, at: 0, ang: 1.6, spread: 0.5 }], boss: null }] };
        window.__seen.clear();
        const B = G.start({ custom: def }, { seed: 5, team: ['thep', 'mua', 'yta', 'gio'] });
        window.__sim(k === 'bloater' ? 4 : 9); window.__step(4);
        const e = B.enemies.find((x) => x.alive && x.kind === k);
        return { uid: e && e.uid, seen: window.__seen.has(k), alive: B.enemies.filter((x) => x.alive).length };
      }, kind);
      check(info.seen && (info.uid || kind === 'bloater'), `zoo ${kind}: ${info.alive} alive`);
      sheets.zoo.push(await shot(page, `zoo-${kind}.png`));
      await page.evaluate((u) => { if (u) window.__G.cam.spectate(u); window.__step(70); }, info.uid);
      sheets.zooChase.push(await shot(page, `zoo-${kind}-chase.png`));
      await page.evaluate(() => { window.__G.cam.spectate(0); });
    }
    check(bad(problems).length === 0, `zoo: no console problems ${problems.slice(0, 3).join(' | ')}`);
    check((await page.evaluate(() => window.__errors.length)) === 0, `zoo: __errors empty ${(await page.evaluate(() => window.__errors.slice(0, 2).join(' | ')))}`);
    await ctx.close();

    // each hero alone against a couple of walkers, long enough to cast
    const h = await open(br, srv.base, 's22', 'noaudio=1&seed=9');
    for (const id of HEROES) {
      await h.page.evaluate((i) => { window.__G.start(2, { seed: 9, team: [i], auto: { ult: true } }); window.__sim(14); window.__step(4); }, id);
      sheets.heroes.push(await shot(h.page, `hero-${id}.png`));
      const p = await h.page.evaluate(probe);
      check(p.heroesIn === 1, `hero ${id} in frame`);
    }
    check(bad(h.problems).length === 0, `heroes: no console problems ${h.problems.slice(0, 3).join(' | ')}`);
    await h.ctx.close();
  }

  if (!QUICK) {
    // every effect key the data names has an entry, and every hero's skills play effects when cast
    {
      const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=9');
      await page.evaluate(WAIT);
      const miss = await page.evaluate(async () => {
        const { HEROES } = await import(new URL('js/data/heroes.js' + ((document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0]), location.href).href); const { ENEMY } = await import(new URL('js/data/enemies.js' + ((document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0]), location.href).href);
        const { KEYS } = await import(new URL('js/view/fxmap.js' + ((document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0]), location.href).href); const keys = new Set();
        const add = (o) => { if (o && o.fx) keys.add(o.fx); };
        for (const h of HEROES) { add(h.attack); add(h.s1); add(h.s2); add(h.ult); }
        for (const e of Object.values(ENEMY)) { add(e.attack); add(e.s1); add(e.s2); add(e.s3); for (const s of e.skills || []) add(s); }
        return [...keys].filter((k) => !KEYS[k]);
      });
      check(miss.length === 0, `fxmap has an entry for every data key (missing: ${miss.join(',') || 'none'})`);
      const skillKeys = await page.evaluate(async () => { const { HEROES } = await import(new URL('js/data/heroes.js' + ((document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0]), location.href).href); return HEROES.map((h) => [h.id, [h.s1, h.s2, h.ult].filter(Boolean).map((s) => s.fx)]); });
      for (const [id, keys] of skillKeys) {
        const left = await page.evaluate(([i, ks]) => {
          const G = window.__G; for (const k of Object.keys(G.actors.fx.counters)) delete G.actors.fx.counters[k];
          G.start(6, { seed: 9, team: [i, 'thep'], auto: { ult: true, pick: 'best' }, hpFlat: 4000, atkFlat: 20 });
          const need = new Set(ks);
          for (let t = 0; t < 10 && need.size; t++) { for (const h of G.B.heroes) { h.ult = 1; h.hp = h.maxHp * 0.5; } window.__sim(5); for (const k of [...need]) if (G.actors.fx.counters[k] > 0) need.delete(k); }
          return [...need];
        }, [id, keys]);
        check(left.length === 0, `hero ${id}: every skill played an effect (not seen: ${left.join(',') || 'none'})`);
      }
      const warn = await page.evaluate(() => [...window.__G.actors.fx.missing]);
      check(warn.length === 0, `fxmap fallback never used (${warn.join(',') || 'none'})`);
      await ctx.close();
      check(bad(problems).length === 0, `fx coverage: no console problems ${problems.slice(0, 2).join(' | ')}`);
    }

    // each hero's ultimate at its peak, brightness of every frame
    {
      const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=9');
      await page.evaluate(WAIT); const ults = [];
      for (const id of HEROES) {
        await page.evaluate((i) => { const B = window.__G.start(2, { seed: 9, team: [i, 'thep', 'yta', 'mua'], auto: { ult: true, pick: 'best' }, hpFlat: 3000 }); B.heroes[0].ult = 1; }, id);
        const e = await page.evaluate(([i]) => window.__wait('ult', `e.hero === '${i}'`, 60), [id]);
        if (!e) { check(false, `hero ${id}: ultimate never cast`); continue; }
        // the old real-time wait landed on a different moment every run: take the brightest of 12 fixed moments over the next
        // 0.8 s (sim and frames advanced together), so the check judges the flash peak, not one lucky frame
        let f = ''; let w = -1;
        for (let k = 0; k < 12; k++) {
          await page.evaluate(() => { window.__sim(0.05); window.__step(4); });
          const fk = await shot(page, `ult-${id}-${k}.png`); const wk = pix(fk, FOG[3], null).white;
          if (wk > w) { w = wk; f = fk; }
        }
        fs.copyFileSync(f, path.join(OUT, `ult-${id}.png`)); f = path.join(OUT, `ult-${id}.png`); ults.push(f); sheets.ults.push(f);
        check(w < 0.01, `ultimate ${id}: clipped white ${(w * 100).toFixed(2)}% (< 1%)`);
      }
      await ctx.close();
      check(bad(problems).length === 0, `ultimates: no console problems ${problems.slice(0, 2).join(' | ')}`);
    }

    // boss warnings: a mark must be visible at its projected centre while it fills, and gone after
    {
      const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=5');
      await page.evaluate(WAIT);
      for (const [stage, shape] of [[2, 'circle'], [10, 'line'], [20, 'cone']]) {
        await page.evaluate((n) => { window.__G.start(n, { seed: 5, wave: 5, auto: { ult: true, pick: 'best' } }); }, stage);
        const e = await page.evaluate((sh) => window.__wait('tele', `e.team === 1 && e.shape === '${sh}' && (e.shape !== 'circle' || e.fall)`, 90), shape);
        if (!e) { check(false, `boss stage ${stage}: no ${shape} warning seen`); continue; }
        const cx = e.shape === 'line' ? (e.x + e.x2) / 2 : e.shape === 'cone' ? e.x + Math.cos(e.ang) * e.r * 0.5 : e.x;
        const cz = e.shape === 'line' ? (e.z + e.z2) / 2 : e.shape === 'cone' ? e.z + Math.sin(e.ang) * e.r * 0.5 : e.z;
        await page.evaluate((n) => window.__step(n), Math.max(6, Math.round(e.t * 600 * 0.06)));
        // same frozen frame with and without the warning meshes: nothing else (camera, fire left behind) can differ
        await page.evaluate(() => { window.__G.paused = true; window.__step(1); });
        const at = await projFrac(page, cx, cz); const during = await shot(page, `tele-s${stage}-${shape}.png`); sheets.tele.push(during);
        const live = await page.evaluate(() => { const recs = window.__G.actors.marks.teleRecs; for (const r of recs) r.mesh.visible = false; window.__step(1); return recs.length; });
        const after = await shot(page, `tele-s${stage}-${shape}-after.png`);
        await page.evaluate(() => { for (const r of window.__G.actors.marks.teleRecs) r.mesh.visible = true; window.__G.paused = false; });
        const a = pix(during, FOG[3], at).rb; const b = pix(after, FOG[3], at).rb;
        check(live > 0 && a - b > 12, `boss stage ${stage} ${shape} warning visible at its centre: red-blue ${a.toFixed(0)} with the mark vs ${b.toFixed(0)} without it in the same frame, ${live} marks live (diff > 12)`);
      }
      await ctx.close();
      check(bad(problems).length === 0, `warnings: no console problems ${problems.slice(0, 2).join(' | ')}`);
    }

    // every skill of every boss at tier 3 changes the boss's pose within 0.3 s, and a strip per boss to look at
    {
      const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=5');
      for (const kind of BOSSES) {
        const names = await page.evaluate((k) => {
          const G = window.__G; const def = { ...G.stageDef(1), hpMul: 1e6, atkMul: 0.0001, bossHp: 1, bossTier: 3, boss: k, waves: [{ groups: [{ kind: k, n: 1, at: 0, ang: 1.6, spread: 0.1 }], boss: null }] };
          const B = G.start({ custom: def }, { seed: 5, team: ['thep', 'mua', 'yta', 'gio'] });
          window.__sim(2); G.paused = true;
          const u = B.enemies.find((x) => x.alive && x.kind === k); G.cam.spectate(u.uid); window.__step(100);
          const n = G.actors.nodeOf(u.uid);
          // rotations of every joint of the boss body (the root's own heading excluded)
          window.__bp = { G, B, u, snap: () => { const a = []; n.traverse((o) => { a.push(o.rotation.x, o.rotation.y, o.rotation.z); }); return a; },
            dev: (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) if (i % 3 !== 1 || i < 3) t += Math.abs(a[i] - b[i]); return t; },
            zb: () => G.host.G.zombies.list.find((z) => z.alive && z.T.boss) };
          return u.skills.filter((sk) => sk.def.name).map((sk) => [sk.slot, sk.def.name]);
        }, kind);
        const files = [await shot(page, `boss-${kind}-idle.png`)]; const devs = [];
        for (const [slot, name] of names) {
          await page.evaluate((sl) => {
            const { G, u } = window.__bp; window.__step(90); const sk = u.skills.find((x) => x.slot === sl);
            G.actors.onEvent({ e: 'cast', uid: u.uid, slot: sl, key: sk.def.fx, name: sk.def.name, x: u.x, z: u.z, boss: true }); window.__step(18);
          }, slot);
          files.push(await shot(page, `boss-${kind}-${slot}.png`));
          // the same frame again without the cast: only the cast can account for the difference
          const d = await page.evaluate(() => {
            const { G, snap, dev, zb } = window.__bp; const z = zb(); const pc = snap(); const bob = z.bob; const ph = z.phase;
            G.actors.bossActs.clear(); if (z.bs) z.bs.cur = null; z.bob = bob - 1 / 60; z.phase = ph; window.__step(1);
            return dev(pc, snap());
          });
          devs.push([name, d]);
        }
        check(devs.every((x) => x[1] > 0.35), `boss ${kind}: every skill changes the pose within 0.3 s (${devs.map((x) => x[0] + ' ' + x[1].toFixed(2)).join(', ')}; > 0.35 rad summed)`);
        sheet(files, path.join(OUT, `boss-${kind}.png`), files.length, 240);
        await page.evaluate(() => { window.__G.paused = false; window.__G.cam.spectate(0); });
      }
      await ctx.close();
      check(bad(problems).length === 0, `boss poses: no console problems ${problems.slice(0, 2).join(' | ')}`);
    }

    // watching through an enemy's or a boss's eyes: the unit between 12% and 45% of the frame height, its target on screen
    {
      const { ctx, page, problems } = await open(br, srv.base, 's22', 'noaudio=1&seed=5');
      const files = [];
      for (const kind of ['walker', 'brute', 'flyer', 'giant', 'dragon', 'ufo']) {
        const r = await page.evaluate((k) => {
          const G = window.__G; const H = G.host;
          const def = { ...G.stageDef(1), hpMul: 1e6, atkMul: 0.0001, bossHp: 1, bossTier: 3, boss: k, waves: [{ groups: [{ kind: k, n: 3, at: 0, ang: 1.6, spread: 0.5 }], boss: null }] };
          const B = G.start({ custom: def }, { seed: 5, team: ['thep', 'mua', 'yta', 'gio'] });
          window.__sim(7); G.paused = true;
          const u = B.enemies.find((x) => x.alive && x.kind === k); if (!u) return null;
          G.cam.spectate(u.uid); window.__step(120);
          const n = G.actors.nodeOf(u.uid); const v = new H.THREE.Vector3(); const w = new H.THREE.Vector3();
          v.set(n.position.x, n.position.y, n.position.z).project(H.camera); w.set(n.position.x, n.position.y + G.actors.heightOf(u.uid), n.position.z).project(H.camera);
          const frac = Math.abs(w.y - v.y) / 2; const tg = B.byUid.get(u.target); let tOn = false;
          if (tg) { const t = new H.THREE.Vector3(tg.x, 1, tg.z).project(H.camera); tOn = Math.abs(t.x) <= 1 && Math.abs(t.y) <= 1 && t.z < 1; }
          return { frac, hasTarget: !!tg, tOn, unitIn: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
        }, kind);
        files.push(await shot(page, `spec-${kind}.png`));
        check(!!r && r.frac >= 0.12 && r.frac <= 0.45 && r.hasTarget && r.tOn && r.unitIn, `spectate ${kind}: unit ${r ? (r.frac * 100).toFixed(0) : '-'}% of the frame height (12..45), target ${r && r.hasTarget ? (r.tOn ? 'on screen' : 'OFF screen') : 'missing'}, unit on screen ${r && r.unitIn}`);
        await page.evaluate(() => { window.__G.paused = false; window.__G.cam.spectate(0); });
      }
      sheet(files, path.join(OUT, 'sheet-spectate.png'), 6, 300);
      await ctx.close();
      check(bad(problems).length === 0, `spectate: no console problems ${problems.slice(0, 2).join(' | ')}`);
    }

    // quality tiers and the desktop frame
    for (const [phone, q] of [['s22', 'medium'], ['s22', 'high'], ['desktop', 'medium']]) {
      const r = await open(br, srv.base, phone, `autostart=1&stage=6&wave=5&autoult=1&autopick=1&noaudio=1&seed=6&q=${q}`);
      await r.page.evaluate(() => window.__sim(9)); await r.page.evaluate(() => window.__step(4));
      sheets.tiers.push(await shot(r.page, `tier-${phone}-${q}.png`));
      check(bad(r.problems).length === 0, `${phone} q=${q}: no console problems ${r.problems.slice(0, 2).join(' | ')}`);
      await r.ctx.close();
    }
  }
} finally {
  await br.close(); srv.close();
}
const cols = { main: 4, zoo: 6, zooChase: 6, heroes: 5, ults: 5, tele: 3, tiers: 3 };
for (const [name, files] of Object.entries(sheets)) if (files.length) sheet(files, path.join(OUT, `sheet-${name}.png`), cols[name], 300);
console.log(`elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
