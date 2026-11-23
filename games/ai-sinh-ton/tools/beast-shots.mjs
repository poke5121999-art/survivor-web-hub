// The beast kit, judged on the real pages. On beast-demo.html: a turntable sheet per beast (every form at four angles,
// battle lod) and a portrait line-up; per form the draw calls at lod battle (<= 4), the standing height (0.8-1.6 m),
// and the side-silhouette IoU against every other form of the same beast (< 0.8: a new form is a new shape, not the
// old one scaled). In the game: a fight with the four starters swapped to each set of forms, shot at the battle camera
// beside the zombies, every beast inside the frame and its on-screen height recorded. No console problems anywhere.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/beast-shots.mjs [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'a10', 'creature');
fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
const { check, done } = checker();
const DEMO = '/games/ai-sinh-ton/beast-demo.html';
const STARTERS = ['tegiap', 'nhim', 'loc', 'chon'];
const OLD = { tegiap: 'thep', nhim: 'mua', loc: 'yta', chon: 'gio' };
const bad = (list) => list.filter((x) => !/Failed to load resource/.test(x));

const srv = await serve();
const br = await launch();
try {
  // ---- the kit on its own page ----
  const d = await open(br, srv.base, 'desktop', 'shot=1&freeze=1&lod=battle', { path: DEMO, fresh: true });
  const keys = await d.page.evaluate(() => window.__demo.keys);
  const want = ['tegiap.1', 'tegiap.2', 'tegiap.3a', 'tegiap.3b', 'nhim.1', 'nhim.2', 'nhim.3', 'loc.1', 'loc.2', 'loc.3a', 'loc.3b', 'chon.1', 'chon.2', 'chon.3'];
  check(want.every((k) => keys.includes(k)), `all 14 starter forms are drawn (${keys.length} looks: ${keys.join(' ')})`);
  for (const k of want) {
    const r = await d.page.evaluate((key) => window.__demo.drawCalls(key, 'battle'), k);
    check(r.calls <= 4, `${k}: ${r.calls} draw calls at lod battle (<= 4)`);
    check(r.height >= 0.8 && r.height <= 1.6, `${k}: stands ${r.height} m (0.8-1.6)`);
  }
  for (const id of STARTERS) {
    const fs2 = want.filter((k) => k.startsWith(id + '.'));
    for (let i = 0; i < fs2.length; i++) for (let j = i + 1; j < fs2.length; j++) {
      const v = await d.page.evaluate(([a, b]) => window.__demo.iou(a, b), [fs2[i], fs2[j]]);
      check(v < 0.8, `${fs2[i]} vs ${fs2[j]}: side silhouette IoU ${v.toFixed(2)} (< 0.8)`);
    }
  }
  // turntables: each beast's forms side by side at four angles, one row per angle
  for (const id of STARTERS) {
    const fs2 = want.filter((k) => k.startsWith(id + '.')); const files = [];
    await d.page.evaluate((ks) => window.__demo.layout(ks, { lod: 'battle', cols: ks.length, gap: 2.5 }), fs2);
    for (const [i, yaw] of [0.6, Math.PI / 2, Math.PI + 0.6, -Math.PI / 2].entries()) {
      await d.page.evaluate((y) => { window.__demo.view(y); window.__demo.set({ anim: 'idle' }); window.__demo.step(1 / 30, 24); }, yaw);
      const f = path.join(OUT, `turn-${id}-${i}.png`); await d.page.screenshot({ path: f }); files.push(f);
    }
    sheet(files, path.join(OUT, `turn-${id}.png`), 1, 960);
  }
  // portrait line-up and a running frame of every form
  for (const [name, anim, lod] of [['portrait', 'idle', 'portrait'], ['run', 'run', 'battle'], ['attack', 'attack', 'battle']]) {
    await d.page.evaluate(([ks, a, l]) => { window.__demo.layout(ks, { lod: l, cols: 7 }); window.__demo.view(0.5); window.__demo.set({ anim: a, speed: a === 'run' ? 3 : 0 }); window.__demo.step(1 / 30, a === 'attack' ? 4 : 18); }, [want, anim, lod]);
    await d.page.screenshot({ path: path.join(OUT, `lineup-${name}.png`) });
  }
  check(bad(d.problems).length === 0, `demo page: no console problems ${bad(d.problems).slice(0, 2).join(' | ')}`);
  await d.ctx.close();

  // ---- in the fight, at the battle camera, beside the zombies ----
  const SETS = QUICK ? [[1, null]] : [[1, null], [2, null], [3, 'a'], [3, 'b']];
  for (const phone of ['s22', 'xiaomi']) {
    for (const [form, branch] of SETS) {
      const g = await open(br, srv.base, phone, 'autostart=1&stage=3&noaudio=1&seed=3', { freeze: true });
      const r = await g.page.evaluate(([form, branch, OLD]) => {
        const G = window.__G; G.start(3, { seed: 3, teamSpec: Object.values(OLD).map((id) => ({ id, mul: 1 })), auto: { ult: false, pick: 'best' } }); G.goto('hud', { stage: 3 });
        const B = G.B; for (let i = 0; i < 60 && B.enemies.filter((e) => e.alive).length < 6; i++) window.__sim(0.5);
        const ids = Object.keys(OLD);
        for (const u of B.heroes) { const id = ids[u.slot]; const br2 = form === 3 ? (id === 'nhim' || id === 'chon' ? null : branch) : null; u.def = { ...u.def, id, form, branch: br2 }; G.actors.onEvent({ e: 'gone', uid: u.uid }); }
        window.__step(40);
        const H = G.host; const v = new H.THREE.Vector3(); const out = [];
        for (const u of B.heroes) {
          const bst = G.actors.beastOf(u.uid); const n = G.actors.nodeOf(u.uid);
          const a = v.set(n.position.x, n.position.y, n.position.z).project(H.camera).clone(); const b = v.set(n.position.x, n.position.y + bst.height, n.position.z).project(H.camera).clone();
          out.push({ key: bst.key, generic: bst.generic, h: bst.height, inFrame: Math.abs(a.x) <= 1 && Math.abs(a.y) <= 1, px: +(Math.abs(b.y - a.y) / 2 * H.size.h).toFixed(1), draws: bst.drawCalls });
        }
        return { out, enemies: B.enemies.filter((e) => e.alive).length };
      }, [form, branch, OLD]);
      const tag = `${phone} forms ${form}${branch || ''}`;
      check(r.out.length === 4 && r.out.every((x) => !x.generic), `${tag}: the four starters drawn as ${r.out.map((x) => x.key).join(', ')}`);
      check(r.out.every((x) => x.inFrame), `${tag}: every beast inside the frame`);
      check(r.out.every((x) => x.draws <= 4), `${tag}: draw calls per beast ${r.out.map((x) => x.draws).join('/')} (<= 4)`);
      console.log(`  ${tag}: on-screen height px ${r.out.map((x) => x.px).join(' / ')} (frame ${phone === 's22' ? 360 : 461} px tall), ${r.enemies} zombies`);
      await g.page.locator('#frame').screenshot({ path: path.join(OUT, `battle-${phone}-${form}${branch || ''}.png`) });
      check(bad(g.problems).length === 0, `${tag}: no console problems ${bad(g.problems).slice(0, 2).join(' | ')}`);
      await g.ctx.close();
    }
  }
  console.log(`pictures in ${OUT}`);
} finally { await br.close(); srv.close(); }
done();
