// The beast kit, judged on the real pages. On beast-demo.html: a turntable sheet per beast (every form at four angles,
// battle lod) and a portrait line-up; per form the draw calls at lod battle (<= 4), the standing height (0.8-1.6 m),
// and the side-silhouette IoU against every other form of the same beast (< 0.8: a new form is a new shape, not the
// old one scaled). In the game: a fight with the four starters swapped to each set of forms, shot at the battle camera
// beside the zombies, every beast inside the frame and its on-screen height recorded. No console problems anywhere.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/beast-shots.mjs [--quick] [--only=ech,cu] [--forms=1] [--out=creature2]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';

const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1];
const OUT = path.join(ROOT, '.chk', 'a10', arg('out') || 'creature');
fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
// every beast and its forms; the four starters first (the fight swaps them in for the old heroes thep, mua, yta, gio)
const BEASTS = {
  tegiap: ['1', '2', '3a', '3b'], nhim: ['1', '2', '3'], loc: ['1', '2', '3a', '3b'], chon: ['1', '2', '3'],
  ech: ['1', '2', '3a', '3b'], cu: ['1', '2', '3'], duoi: ['1', '2', '3'], kyda: ['1', '2', '3a', '3b'], oc: ['1', '2', '3'],
  haily: ['1', '2', '3'], bosat: ['1', '2', '3a', '3b'], bao: ['1', '2', '3'], nhen: ['1', '2', '3'], muc: ['1', '2', '3'],
};
const ONLY = arg('only') ? arg('only').split(',') : Object.keys(BEASTS);
const FORMS = arg('forms') ? arg('forms').split(',') : null;
const formsOf = (id) => BEASTS[id].filter((f) => !FORMS || FORMS.includes(f[0])).map((f) => `${id}.${f}`);
const { check, done } = checker();
const DEMO = '/games/ai-sinh-ton/beast-demo.html';
const OLD = { tegiap: 'thep', nhim: 'mua', loc: 'yta', chon: 'gio' };
const bad = (list) => list.filter((x) => !/Failed to load resource/.test(x));

const srv = await serve();
const br = await launch();
try {
  // ---- the kit on its own page ----
  const d = await open(br, srv.base, 'desktop', 'shot=1&freeze=1&lod=battle', { path: DEMO, fresh: true });
  const keys = await d.page.evaluate(() => window.__demo.keys);
  const want = ONLY.flatMap(formsOf);
  const missing = want.filter((k) => !keys.includes(k));
  check(!missing.length, `all ${want.length} forms are drawn${missing.length ? ', missing ' + missing.join(' ') : ''}`);
  for (const k of want) {
    const r = await d.page.evaluate((key) => window.__demo.drawCalls(key, 'battle'), k);
    check(r.calls <= 4, `${k}: ${r.calls} draw calls at lod battle (<= 4)`);
    check(r.height >= 0.8 && r.height <= 1.6, `${k}: stands ${r.height} m (0.8-1.6)`);
  }
  for (const id of ONLY) {
    const fs2 = want.filter((k) => k.startsWith(id + '.'));
    for (let i = 0; i < fs2.length; i++) for (let j = i + 1; j < fs2.length; j++) {
      const v = await d.page.evaluate(([a, b]) => window.__demo.iou(a, b), [fs2[i], fs2[j]]);
      check(v < 0.8, `${fs2[i]} vs ${fs2[j]}: side silhouette IoU ${v.toFixed(2)} (< 0.8)`);
    }
  }
  // turntables: each beast's forms side by side at four angles, one row per angle
  for (const id of ONLY) {
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
  const SETS = (QUICK ? [[1, null]] : [[1, null], [2, null], [3, 'a'], [3, 'b']]).filter(([f]) => !FORMS || FORMS.includes(String(f)));
  // the fight has four hero slots: the beasts go in by fours (the last four padded with starters)
  const TEAMS = []; for (let i = 0; i < ONLY.length; i += 4) TEAMS.push(ONLY.slice(i, i + 4));
  if (TEAMS.length && TEAMS[TEAMS.length - 1].length < 4) TEAMS[TEAMS.length - 1].push(...Object.keys(OLD).filter((x) => !TEAMS[TEAMS.length - 1].includes(x)).slice(0, 4 - TEAMS[TEAMS.length - 1].length));
  for (const phone of ['s22', 'xiaomi']) for (const team of TEAMS) {
    for (const [form, branch] of SETS) {
      const g = await open(br, srv.base, phone, 'autostart=1&stage=3&noaudio=1&seed=3', { freeze: true });
      const r = await g.page.evaluate(([form, branch, OLD, team, BEASTS]) => {
        const G = window.__G; G.start(3, { seed: 3, teamSpec: Object.values(OLD).map((id) => ({ id, mul: 1 })), auto: { ult: false, pick: 'best' } }); G.goto('hud', { stage: 3 });
        const B = G.B; for (let i = 0; i < 60 && B.enemies.filter((e) => e.alive).length < 6; i++) window.__sim(0.5);
        for (const u of B.heroes) { const id = team[u.slot]; const br2 = form === 3 && BEASTS[id].includes('3a') ? branch : null; u.def = { ...u.def, id, form, branch: br2 }; G.actors.onEvent({ e: 'gone', uid: u.uid }); }
        window.__step(40);
        const H = G.host; const v = new H.THREE.Vector3(); const out = [];
        for (const u of B.heroes) {
          const bst = G.actors.beastOf(u.uid); const n = G.actors.nodeOf(u.uid);
          const a = v.set(n.position.x, n.position.y, n.position.z).project(H.camera).clone(); const b = v.set(n.position.x, n.position.y + bst.height, n.position.z).project(H.camera).clone();
          out.push({ key: bst.key, generic: bst.generic, h: bst.height, inFrame: Math.abs(a.x) <= 1 && Math.abs(a.y) <= 1, px: +(Math.abs(b.y - a.y) / 2 * H.size.h).toFixed(1), draws: bst.drawCalls });
        }
        return { out, enemies: B.enemies.filter((e) => e.alive).length };
      }, [form, branch, OLD, team, BEASTS]);
      const tag = `${phone} ${team.join('+')} forms ${form}${branch || ''}`;
      check(r.out.length === 4 && r.out.every((x) => !x.generic), `${tag}: the four beasts drawn as ${r.out.map((x) => x.key).join(', ')}`);
      check(r.out.every((x) => x.inFrame), `${tag}: every beast inside the frame`);
      check(r.out.every((x) => x.draws <= 4), `${tag}: draw calls per beast ${r.out.map((x) => x.draws).join('/')} (<= 4)`);
      console.log(`  ${tag}: on-screen height px ${r.out.map((x) => x.px).join(' / ')} (frame ${phone === 's22' ? 360 : 461} px tall), ${r.enemies} zombies`);
      await g.page.locator('#frame').screenshot({ path: path.join(OUT, `battle-${phone}-${team[0]}-${form}${branch || ''}.png`) });
      check(bad(g.problems).length === 0, `${tag}: no console problems ${bad(g.problems).slice(0, 2).join(' | ')}`);
      await g.ctx.close();
    }
  }
  console.log(`pictures in ${OUT}`);
} finally { await br.close(); srv.close(); }
done();
