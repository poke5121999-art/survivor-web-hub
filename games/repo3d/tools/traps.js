// Floor traps (js/traps.js). Houses carry the prefab traps (all 8 kinds over the themes). Each kind on the player standing
// in it: spike (one strike per cycle), laser and fire (per 0.5 s tick in the beam, the beam stops at a wall), gas (poison
// 2 hp/s for 3 s), ice (5, frozen 1 s then slower), poison puddle (2 hp/s), mud (half speed), smoke (on when you enter
// its room, a grey veil; a blow on its vent hole switches it off for good). Nothing while asleep or in the air (you can
// jump over a trap). A hit is loud and sends the joker. Loot in a spike loses 3 % x frag of its first value per strike,
// none on a pad. Pictures of each kind at work.
// Usage: node tools/traps.js [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('traps'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 500) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player, TR = G.traps; window.__paused = true; __sim(1);
  const T = window.__T = {};
  T.all = TR.list.slice();
  // an open cell with a clear 6-cell run along +x (for beams), same floor
  T.cell = (skip = 0) => { for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); let ok = true; for (let k = -2; k <= 7 && ok; k++) for (const s of [-1, 0, 1]) if (!nav.okW(c.x + k, c.z + s) || G.house.heightAt(c.x + k, c.z + s) !== G.house.heightAt(c.x, c.z)) ok = false; if (ok && skip-- <= 0) return c; } return null; };
  T.mk = (kind, c, dir = 0, len = 4) => { const L = G.house.layout, rid = L.rooms.findIndex((r) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.y && c.z < r.y + r.h);
    for (const t of TR.list) TR.root.remove(t.g); const tr = TR.build({ x: Math.floor(c.x), y: Math.floor(c.z), kind, dir, len, roomId: rid }); TR.list = [tr]; return tr; };
  T.phase = (tr, st) => { const C = tr.C, a = C.period - C.warn - C.on, want = st === 'sleep' ? 0.1 : st === 'warn' ? a + 0.05 : a + C.warn + 0.02; tr.phase = (((want - TR.time) % C.period) + C.period) % C.period / C.period; };
  T.put = (x, z, lx, lz) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; if (lx !== undefined) P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = 0; __sim(0.05); };
  T.fresh = () => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.hp = 100; P.down = false; P.stamina = 100; P.poisonT = 0; P.freezeT = 0; P.iceSlowT = 0; P.push = null; TR.log.length = 0; };
  T.logs = (k) => TR.log.filter((e) => e[0] === k);
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, F = G.foes, TR = G.traps;');

const CASES = {
  'spike: one strike per cycle on who stands on it; nothing asleep or in the air; loud; the joker comes': `(() => { T.fresh(); const c = T.cell(), tr = T.mk('spike', c); T.put(tr.cx, tr.cz);
    T.phase(tr, 'sleep'); __sim(0.2); const asleep = P.hp; T.phase(tr, 'warn'); __sim(0.2); const warn = P.hp;
    const j = F.spawn('joker', tr.cx + 6, tr.cz, { sleep: 0 }); const id0 = G.noise.lastId(); T.phase(tr, 'on'); __sim(0.3); const hit = 100 - P.hp, loud = G.noise.events.some((e) => e.id > id0 && e.src === 'trap'), rush = !!j.rush; F.remove(j);
    P.hp = 100; T.phase(tr, 'warn'); __sim(0.65); __sim(1 / 60, { ...__IDLE, jump: true }); __sim(0.25); const air = 100 - P.hp;
    return { ok: asleep === 100 && warn === 100 && hit === TR.list[0].C.dmg && loud && rush && air === 0, asleep, warn, hit, loud, rush, air }; })()`,
  'laser and fire: per 0.5 s tick in the beam (6 and 7), nothing beside it; the beam stops at a wall': `(() => { const out = {};
    for (const k of ['laser', 'fire']) { T.fresh(); const c = T.cell(), tr = T.mk(k, c, 0, 4); T.put(tr.cx + 2, tr.cz); T.phase(tr, 'on'); P.hp = 100; __sim(1.0); const inBeam = 100 - P.hp;
      T.put(tr.cx + 2, tr.cz + 0.9); T.phase(tr, 'on'); P.hp = 100; __sim(1.0); const beside = 100 - P.hp; out[k] = { inBeam, beside, reach: +tr.reach.toFixed(2) }; }
    // a wall 2 cells along: the beam ends there
    let wc = null; for (const i of nav.cells) { const c = nav.center(i); if (nav.okW(c.x + 1, c.z) && !nav.okW(c.x + 2.5, c.z) && !nav.okW(c.x + 3, c.z)) { wc = c; break; } }
    const tw = T.mk('laser', wc, 0, 6);
    return { ok: out.laser.inBeam === 12 && out.fire.inBeam === 14 && out.laser.beside === 0 && out.fire.beside === 0 && tw.reach < 3, out, wallReach: +tw.reach.toFixed(2) }; })()`,
  'gas: poison 2 hp/s for 3 s after the jet touches you': `(() => { T.fresh(); const c = T.cell(), tr = T.mk('gas', c, 0, 4); T.put(tr.cx + 2, tr.cz); T.phase(tr, 'on'); __sim(0.05); const touched = P.poisonT > 2.9;
    T.put(tr.cx + 2, tr.cz + 3); P.hp = 100; __sim(3.2); const lost = 100 - P.hp;
    return { ok: touched && Math.abs(lost - 6) < 1.01, touched, lost }; })()`,
  'ice: 5, frozen 1 s (no walking), then slower x0.6': `(() => { T.fresh(); const c = T.cell(), tr = T.mk('ice', c); T.put(tr.cx, tr.cz, tr.cx + 5, tr.cz); T.phase(tr, 'on'); __sim(0.1); const hp = P.hp;
    const q0 = { ...P.position }; __sim(0.8, { ...__IDLE, mz: 1 }); const frozen = Math.hypot(P.position.x - q0.x, P.position.z - q0.z);
    TR.list = []; __sim(0.2); P.iceSlowT = 1.5; const q1 = { ...P.position }; __sim(0.5, { ...__IDLE, mz: 1 }); const slow = Math.hypot(P.position.x - q1.x, P.position.z - q1.z); P.iceSlowT = 0; const q2 = { ...P.position }; __sim(0.5, { ...__IDLE, mz: 1 }); const norm = Math.hypot(P.position.x - q2.x, P.position.z - q2.z);
    return { ok: hp === 95 && frozen < 0.02 && Math.abs(slow / norm - 0.6) < 0.06, hp, frozen: +frozen.toFixed(3), ratio: +(slow / norm).toFixed(2) }; })()`,
  'poison puddle 2 hp/s standing in it, none while you hop over; mud halves your speed': `(() => { T.fresh(); const c = T.cell(), tr = T.mk('poison', c); T.put(tr.cx, tr.cz); P.hp = 100; __sim(2.02); const lost = 100 - P.hp;
    P.hp = 100; for (let i = 0; i < 3; i++) { __sim(1 / 60, { ...__IDLE, jump: true }); P.stamina = 100; __sim(0.3); } const hop = 100 - P.hp;
    const m = T.mk('mud', c); T.put(m.cx - 0.6, m.cz, m.cx + 5, m.cz); const q0 = { ...P.position }; __sim(0.4, { ...__IDLE, mz: 1 }); const inMud = Math.hypot(P.position.x - q0.x, P.position.z - q0.z);
    TR.list = []; T.put(m.cx - 0.6, m.cz, m.cx + 5, m.cz); const q1 = { ...P.position }; __sim(0.4, { ...__IDLE, mz: 1 }); const free = Math.hypot(P.position.x - q1.x, P.position.z - q1.z);
    return { ok: Math.abs(lost - 4) < 1.01 && hop < 1.01 && Math.abs(inMud / free - 0.5) < 0.08, lost, hop, ratio: +(inMud / free).toFixed(2) }; })()`,
  'smoke: on when you enter its room (grey veil), a blow on the vent switches it off for good': `(() => { T.fresh(); const c = T.cell(), tr = T.mk('smoke', c); const r = tr.room; let out = null;
    for (const i of nav.cells) { const q = nav.center(i); if (!(q.x >= r.x && q.x < r.x + r.w && q.z >= r.y && q.z < r.y + r.h) && Math.hypot(q.x - tr.cx, q.z - tr.cz) < 30) { out = q; break; } }
    T.put(out.x, out.z); __sim(0.2); const offOut = !tr.on; T.put(tr.cx + 1.2, tr.cz, tr.cx, tr.cz); __sim(0.2); TR.render(1 / 60); const on = tr.on, veil = +document.querySelector('.hx-smoke').style.opacity;
    T.put(tr.cx + 0.5, tr.cz, tr.cx, tr.cz); P.pitch = -1.15; __sim(0.05); G.melee.cdT = 0; __sim(0.05, { ...__IDLE, melee: true }); for (let i = 0; i < 40 && tr.on; i++) __sim(1 / 60); const off = !tr.on && tr.broken; T.put(out.x, out.z); __sim(0.2); T.put(tr.cx + 1.2, tr.cz); __sim(0.3); TR.render(1 / 60);
    return { ok: offOut && on && veil > 0.8 && off && !tr.on && +document.querySelector('.hx-smoke').style.opacity === 0, offOut, on, veil, off, last: G.melee.log.slice(-1)[0]?.target }; })()`,
  'loot in a spike loses 3 % x frag of its first value per strike; none on a pad': `(() => { T.fresh(); const c = T.cell(), tr = T.mk('spike', c); T.put(tr.cx + 4, tr.cz);
    const it = G.loot.items.find((q) => !q.dead && q.material === 'wood') || G.loot.items.find((q) => !q.dead); it.body.setTranslation({ x: tr.cx, y: tr.y + 0.4, z: tr.cz }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); __sim(0.6);
    const v0 = it.value; T.phase(tr, 'on'); __sim(0.6); const e = T.logs('loot')[0], lost = v0 - it.value, want = e ? Math.max(1, Math.round(it.value0 * e[3] * 0.03)) : -1;
    const pad = G.extract.pads[G.extract.active]; const t2 = T.mk('spike', { x: pad.x, z: pad.z }); it.body.setTranslation({ x: pad.x, y: t2.y + 0.4, z: pad.z }, true); __sim(0.6); const v1 = it.value; T.phase(t2, 'on'); __sim(0.6);
    return { ok: lost === want && it.value === v1, lost, want, onPad: v1 - it.value }; })()`,
};

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  if (await page.evaluate('!!window.__fatal')) throw new Error('fatal: ' + await page.evaluate('String(window.__fatal)'));
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 480 s'); process.exit(2); }, 480000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=4&seed=7&foes=none&bots=0&passives=0&theme=spacestation');
    const data = await page.evaluate(`(() => { const k = {}; for (const t of __T.all) k[t.kind] = (k[t.kind] || 0) + 1; return { n: __T.all.length, k }; })()`);
    check(data.n > 10 && data.k.laser > 0 && data.k.spike > 0, 'the house carries its prefab traps (spacestation house 4)', data);
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    const shots = [];
    const scenes = [['spike', 'pyramid'], ['laser', 'spacestation'], ['fire', 'vampire'], ['gas', 'asylum'], ['ice', 'spacestation'], ['poison', 'vietnam'], ['mud', 'vietnam'], ['smoke', 'asylum']];
    ({ ctx, page, logs } = await open(br, srv, 'house=4&seed=7&foes=none&bots=0&passives=0&theme=pyramid'));
    for (const [kind, theme] of scenes) {
      if (theme !== (await page.evaluate('__G.house.theme'))) { await ctx.close(); ({ ctx, page, logs } = await open(br, srv, `house=4&seed=7&foes=none&bots=0&passives=0&theme=${theme}`)); }
      await page.evaluate(`document.querySelectorAll('.ui-root, .scanx').forEach((e) => e.style.visibility = 'hidden'); document.querySelectorAll('.hx > *:not(.hx-smoke)').forEach((e) => e.style.visibility = 'hidden')`);
      await page.evaluate(PRE(`(() => { T.fresh(); const c = T.cell(), tr = T.mk('${kind}', c, 0, 4); const beam = ['laser', 'fire', 'gas'].includes('${kind}');
        T.put(tr.cx + (beam ? 2 : 0) - 0.1, tr.cz + (beam ? 2.4 : 2.4), tr.cx + (beam ? 2 : 0), tr.cz); P.pitch = -0.35; P.noDownT = 99;
        if ('${kind}' === 'smoke') { T.put(tr.cx + 1.6, tr.cz + 1.6, tr.cx, tr.cz); P.pitch = -0.3; __sim(0.5); } else if (tr.C.period) { T.phase(tr, 'on'); __sim(0.15); } else __sim(0.1);
        TR.render(1 / 60); P.noDownT = 0; __sim(0.01); return true; })()`));
      const f = path.join(OUT, `trap-${kind}.png`); await page.waitForTimeout(80); await page.screenshot({ path: f }); shots.push(f);
    }
    await ctx.close();
    check(shots.length === scenes.length, 'pictures', shots.length);
    console.log('  ' + shots.join('\n  '));
  } catch (e) { check(false, 'run', e.message.slice(0, 400)); }
  clearTimeout(kill);
  await br.close(); srv.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} pass`);
  process.exit(bad.length ? 1 : 0);
})();
