// Who spends the draw calls: at stage N's most crowded moment (seed N, auto ultimates, best card, q=low xiaomi by default),
// counts every renderBufferDirect call of a frame by owner and prints the owners sorted by calls. Frames are sampled
// across `--frames` real frames from the peak so skill effects show up; the frame with the most calls is printed in full.
// Owners: the horde, zombie puppets, heroes, the HUD overlay, fx, marks, the world, or the top-level object's name.
// Usage: PLAYWRIGHT_PATH=... timeout 900 node games/ai-sinh-ton/tools/perf-split.mjs [--stage=15] [--q=low] [--phone=xiaomi] [--frames=240]
import { serve, launch, open as openPage } from './pw.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const S = +arg('stage', '15'); const Q = arg('q', 'low'); const PHONE = arg('phone', 'xiaomi'); const FR = +arg('frames', '240');

const FIND = ([n]) => {
  const G = window.__G; G.start(n, { seed: n, auto: { ult: true, pick: 'best' } }); const B = G.B;
  let best = { n: 0, ticks: 0 }; let ticks = 0;
  while (ticks < 840 && (B.phase === 'fight' || B.phase === 'pick')) { window.__sim(0.5); ticks++; const k = B.enemies.filter((e) => e.alive).length; if (k > best.n) best = { n: k, ticks }; }
  return best;
};
const RUN = async ([n, ticks, frames]) => {
  const G = window.__G; const H = G.host; const R = H.renderer;
  const v = (document.querySelector('script[src*="main.js"]').src.match(/\?.*$/) || [''])[0];
  const SIM = await import(new URL('js/sim/battle.js' + v, location.href).href);
  const sadd = H.scene.add.bind(H.scene);
  H.scene.add = (...objs) => {
    const st = (new Error().stack || '').split('\n').slice(2).find((l) => !/three/.test(l)) || '';
    const m = st.match(/\/js\/([\w/.-]+?)\.js[^:]*:(\d+)/); const src = m ? m[1] + ':' + m[2] : 'unknown';
    for (const o of objs) if (o && !o.userData.__src) o.userData.__src = src;
    return sadd(...objs);
  };
  G.start(n, { seed: n, auto: { ult: true, pick: 'best' } }); G.goto('hud', { stage: n });
  for (let i = 0; i < ticks; i++) window.__sim(0.5);
  G.paused = true; window.__step(20);
  const tags = new Map();
  const tag = (o, t) => { if (o) o.traverse((c) => { if (!tags.has(c)) tags.set(c, t); }); };
  const A = G.actors;
  if (A.horde) for (const m of A.horde.meshes) tags.set(m, 'horde');
  for (const z of H.G.zombies.list) tag(z.body.root, 'puppet');
  const retag = () => {
    for (const z of H.G.zombies.list) tag(z.body.root, 'puppet');
    if (H.G.player && H.G.player.root) tag(H.G.player.root, 'hero');
  };
  const owner = (o, scene) => {
    if (scene !== H.scene) return 'overlay';
    for (let p = o; p; p = p.parent) {
      if (tags.has(p)) return tags.get(p);
      if (p.parent === H.scene) return (p.userData.__src || 'early') + ' ' + (p.name || p.type);
    }
    return 'scene';
  };
  const orig = R.renderBufferDirect.bind(R);
  let cur = null; let curScene = null;
  const rr = R.render.bind(R);
  R.render = (scene, cam) => { curScene = scene; return rr(scene, cam); };
  R.renderBufferDirect = (camera, scene, geo, mat, obj, group) => {
    if (cur) { const k = owner(obj, curScene); const e = cur.get(k) || { calls: 0, tris: 0, names: new Map() }; e.calls++; e.tris += (geo.index ? geo.index.count : geo.attributes.position ? geo.attributes.position.count : 0) / 3 * (obj.count && obj.isInstancedMesh ? obj.count : 1); const nm = (obj.name || obj.type) + ':' + (mat.type || '') + (mat.name ? '/' + mat.name : ''); e.names.set(nm, (e.names.get(nm) || 0) + 1); cur.set(k, e); }
    return orig(camera, scene, geo, mat, obj, group);
  };
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const B = G.B; let acc = 0; let worst = null; const sum = new Map(); let nF = 0;
  for (let f = 0; f < frames; f++) {
    await raf(); retag();
    acc += 1 / 60; while (acc >= SIM.DT && B.phase === 'fight') { SIM.step(B); acc -= SIM.DT; }
    cur = new Map(); window.__step(1);
    let total = 0; for (const e of cur.values()) total += e.calls;
    for (const [k, e] of cur) { const s = sum.get(k) || 0; sum.set(k, s + e.calls); }
    nF++;
    if (!worst || total > worst.total) worst = { total, f, map: [...cur].map(([k, e]) => [k, e.calls, Math.round(e.tris), [...e.names].sort((a, b) => b[1] - a[1]).slice(0, 6)]).sort((a, b) => b[1] - a[1]) };
    cur = null;
  }
  let objs = 0; let hidden = 0; H.scene.traverse((o) => { objs++; if (!o.visible) hidden++; });
  let umw = 0; for (let i = 0; i < 50; i++) { const a = performance.now(); H.scene.updateMatrixWorld(); umw += performance.now() - a; }
  const top = new Map(); for (const c of H.scene.children) { let k = 0; c.traverse(() => k++); const key = (c.userData.__src || 'early') + ' ' + (c.name || c.type) + (c.visible ? '' : ' (hidden)'); top.set(key, (top.get(key) || 0) + k); }
  const graph = { objs, hidden, umwMs: umw / 50, top: [...top].sort((a, b) => b[1] - a[1]).slice(0, 12) };
  return { graph, worst, mean: [...sum].map(([k, c]) => [k, +(c / nF).toFixed(1)]).sort((a, b) => b[1] - a[1]), stats: window.__stats.draws };
};

const srv = await serve(); const br = await launch();
try {
  let r = await openPage(br, srv.base, 's22', `autostart=1&stage=${S}&autoult=1&autopick=1&noaudio=1&seed=${S}&q=${Q}`);
  const best = await r.page.evaluate(FIND, [S]); await r.ctx.close();
  r = await openPage(br, srv.base, PHONE, `autostart=1&stage=${S}&autoult=1&autopick=1&noaudio=1&seed=${S}&q=${Q}`);
  const o = await r.page.evaluate(RUN, [S, best.ticks, FR]); await r.ctx.close();
  console.log(`stage ${S} q=${Q} ${PHONE}, peak ${best.n} alive; mean calls per frame by owner over ${FR} frames:`);
  for (const [k, c] of o.mean) console.log(`  ${String(c).padStart(6)}  ${k}`);
  console.log(`scene graph: ${o.graph.objs} objects (${o.graph.hidden} hidden roots or nodes), updateMatrixWorld ${o.graph.umwMs.toFixed(3)} ms`); for (const [k, n] of o.graph.top) console.log(`  ${String(n).padStart(6)}  ${k}`);
  console.log(`worst frame #${o.worst.f}: ${o.worst.total} calls`);
  for (const [k, c, t, names] of o.worst.map) console.log(`  ${String(c).padStart(4)} ${String(t).padStart(7)} tris  ${k}  ${names.map(([a, b]) => a + ' x' + b).join(', ')}`);
} finally { await br.close(); srv.close(); }
