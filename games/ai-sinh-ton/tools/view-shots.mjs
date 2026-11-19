// Plays stages in the real page at both phone sizes, screenshots key moments, a zoo of all 24 enemy kinds and all
// 13 heroes, and asserts the view invariants (no console problems, render scale floor, heroes and enemies on screen).
// Usage: PLAYWRIGHT_PATH=... timeout 600 node games/ai-sinh-ton/tools/view-shots.mjs [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'view');
fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const { check, done } = checker();

const ENEMIES = ['walker', 'runner', 'spider', 'flyer', 'hound', 'spitter', 'bloater', 'shielder', 'brute', 'shrieker', 'armored', 'burner', 'frost',
  'giant', 'thrower', 'phantom', 'queen', 'brood', 'vampire', 'alien', 'pharaoh', 'ufo', 'guardian', 'dragon'];
const HEROES = ['gio', 'thep', 'yta', 'mua', 'bong', 'phao', 'bang', 'hoa', 'sam', 'doc', 'ky', 'soi', 'nhen'];

const shot = async (page, file) => { await page.locator('#frame').screenshot({ path: path.join(OUT, file) }); return path.join(OUT, file); };

// heroes inside the frame, and visible zombie roots equal to living sim enemies
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
  out.visible = H.G.zombies.list.filter((z) => z.alive && z.body.root.visible).length;
  return out;
};

const srv = await serve();
const br = await launch();
const sheets = { main: [], zoo: [], zooChase: [], heroes: [] };
try {
  for (const phone of ['s22', 'xiaomi']) {
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
      check(problems.length === 0, `${phone} low: no console problems ${problems.slice(0, 2).join(' | ')}`);
      await ctx.close();
    }
    if (QUICK && phone === 's22') continue;
    // stage 3 from wave 1 on the default tier
    const { ctx, page, problems } = await open(br, srv.base, phone, 'autostart=1&stage=3&autoult=1&autopick=1&noaudio=1&seed=3');
    const moments = [['w1-a', 3], ['w1-b', 12], ['mid', 30], ['mid2', 40]];
    for (const [name, secs] of moments) {
      await page.evaluate((s) => window.__sim(s), secs); await page.evaluate(() => window.__step(4));
      const file = await shot(page, `${phone}-s3-${name}.png`); if (phone === 's22') sheets.main.push(file);
      const p = await page.evaluate(probe);
      check(p.alive === p.visible, `${phone} stage 3 ${name}: visible zombies ${p.visible} = living enemies ${p.alive}`);
    }
    check(problems.length === 0, `${phone} stage 3: no console problems ${problems.slice(0, 2).join(' | ')}`);
    check((await page.evaluate(() => window.__errors.length)) === 0, `${phone} stage 3: __errors empty`);
    await ctx.close();
    // boss waves of stages 1, 5, 7, 20
    for (const s of [1, 5, 7, 20]) {
      const r = await open(br, srv.base, phone, `autostart=1&stage=${s}&wave=5&autoult=1&autopick=1&noaudio=1&seed=${s}`);
      await r.page.evaluate(() => window.__sim(7)); await r.page.evaluate(() => window.__step(4));
      const file = await shot(r.page, `${phone}-boss-s${s}.png`); if (phone === 's22') sheets.main.push(file);
      const p = await r.page.evaluate(probe);
      check(p.heroesIn >= 1 && p.alive === p.visible, `${phone} boss stage ${s}: heroes in frame ${p.heroesIn}, zombies ${p.visible}/${p.alive}`);
      check(r.problems.length === 0 && (await r.page.evaluate(() => window.__errors.length)) === 0, `${phone} boss stage ${s}: no problems ${r.problems.slice(0, 2).join(' | ')}`);
      await r.ctx.close();
    }
  }

  if (!QUICK) {
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
      await page.evaluate((u) => { if (u) window.__G.cam.spectate(u); window.__step(120); }, info.uid);
      sheets.zooChase.push(await shot(page, `zoo-${kind}-chase.png`));
      await page.evaluate(() => { window.__G.cam.spectate(0); });
    }
    check(problems.length === 0, `zoo: no console problems ${problems.slice(0, 3).join(' | ')}`);
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
    check(h.problems.length === 0, `heroes: no console problems ${h.problems.slice(0, 3).join(' | ')}`);
    await h.ctx.close();
  }
} finally {
  await br.close(); srv.close();
}
const cols = { main: 4, zoo: 6, zooChase: 6, heroes: 5 };
for (const [name, files] of Object.entries(sheets)) if (files.length) sheet(files, path.join(OUT, `sheet-${name}.png`), cols[name], 300);
done();
