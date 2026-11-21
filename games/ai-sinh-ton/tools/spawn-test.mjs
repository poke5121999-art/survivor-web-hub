// Where monsters come from (Addendum 8 items 1 and 2). Plays stages 1, 3, 8, 11, 15, 21 and 26 in the real page at the
// Xiaomi size with real frames (sim and view stepped together, the run between pads included) and finds each monster's
// first visible frame: the first frame its drawn head projects inside the frame through the game's camera. There it must
// have a visible source:
//   placed: it was standing in its room before the team got there (a camp unit, drawn where the sim has it, not arriving)
//   gate:   it is within GATE_X m of a spawn gate of its room that is charging or open, the gate's mouth on screen below
//           the top bar
//   summon: a skill put it beside the living monster that cast it, within SUMMON_X m (the spawn event's `by`)
// Anything else appeared in open space. Also: each stage starts in a start room with no monster on its floor at t = 0.
// Prints, per stage, the counts and a few first-visible screen positions (and, for monsters drawn below the floor, that they
// climbed from the abyss).
// Usage: PLAYWRIGHT_PATH=... timeout 1500 node games/ai-sinh-ton/tools/spawn-test.mjs [--stages=1,3]
import { serve, launch, open as openPage, checker } from './pw.mjs';

const argv = process.argv.slice(2);
const stArg = (argv.find((a) => a.startsWith('--stages=')) || '').slice(9);
const STAGES = stArg ? stArg.split(',').map(Number) : [1, 3, 8, 11, 15, 21, 26];
const GATE_X = 2.0;     // metres from the gate's mouth
const SUMMON_X = 4.5;   // metres from the caster
const LIMIT = 260;      // seconds of game time per stage
const T0 = Date.now();
const { check, done } = checker();

const PLAY = async ([limit, gateX, summonX]) => {
  const G = window.__G; const H = G.host; const W = H.world; const B = G.B; const V = new H.THREE.Vector3();
  const url = performance.getEntriesByType('resource').map((r) => r.name).find((n) => /\/js\/sim\/battle\.js/.test(n));
  const SIM = await import(url);
  const u = () => H.size.u || 1;
  const proj = (x, y, z) => { V.set(x, y, z).project(H.camera); const fx = (V.x + 1) / 2; const fy = (1 - V.y) / 2; return { in: V.z < 1 && fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1, px: Math.round(fx * H.size.w / u()), py: Math.round(fy * H.size.h / u()) }; };
  const spawnAt = new Map(); // uid -> spawn event
  G.on((e) => { if (e.e === 'spawn') { const c = e.by !== undefined ? B.byUid.get(e.by) : null; spawnAt.set(e.uid, { x: e.x, z: e.z, t: B.t, gate: e.gate, by: c && c.alive ? Math.hypot(c.x - e.x, c.z - e.z) : null }); } });
  const seen = new Map(); const rows = [];
  const startRoom = { has: !!(W.map && W.map.start), sec: W.sec, n: 0, onFloor: 0 };
  const dt = 1 / 30; let frames = 0; let first = true;
  const gatesNow = () => (W.gateList ? W.gateList() : []);
  while (B.t < limit && (B.phase === 'fight' || B.phase === 'pick') && frames < limit * 60) {
    if (!first && !W.busy && B.phase === 'fight') SIM.step(B);
    G.actors.sync(B, dt); G.cam.update(B, dt); H.update(dt); frames++;
    const cand = [...B.enemies.filter((e) => e.alive), ...((B.camp || []).filter((e) => e.alive))];
    if (first) {
      // t = 0: what stands on the start room's floor
      for (const e of cand) { if (!G.actors.headPos(e.uid, V)) continue; startRoom.n++; if (W.onStartFloor && W.onStartFloor(V.x, V.z)) startRoom.onFloor++; }
      first = false;
    }
    let gl = null;
    for (const e of cand) {
      if (seen.has(e.uid)) continue;
      if (!G.actors.headPos(e.uid, V)) continue;
      const hx = V.x; const hy = V.y; const hz = V.z;
      const p = proj(hx, hy, hz); if (!p.in) continue;
      seen.set(e.uid, 1);
      const sp = spawnAt.get(e.uid) || null;
      const r = { uid: e.uid, kind: e.kind, wave: B.wave, t: +B.t.toFixed(2), px: p.px, py: p.py, sec: W.sec, busy: W.busy, below: hy - 2 * (G.actors.scaleOf(e.uid) || 1) < -0.25, how: 'open', d: null };
      const camp = !!e.camp && !(e.spawnT > 0);
      if (camp) { const off = W.roomOffset ? W.roomOffset(e.room) : { x: 0, z: 0 }; const dd = off ? Math.hypot(hx - (e.x + off.x), hz - (e.z + off.z)) : 9; r.d = +dd.toFixed(2); if (dd < 0.35) r.how = 'placed'; }
      if (r.how === 'open') {
        gl = gl || gatesNow(); let best = 1e9;
        // a gate counts only while it is charging or releasing and its mouth is on screen, below the top bar
        for (const g of gl) { if (!g.open) continue; const q = proj(g.x, 0.3, g.z); if (!q.in || q.py < 40) continue; best = Math.min(best, Math.hypot(hx - g.x, hz - g.z)); }
        if (best <= gateX) { r.how = 'gate'; r.d = +best.toFixed(2); } else if (best < 1e8) r.d = +best.toFixed(2);
      }
      if (r.how === 'open' && sp && sp.gate === undefined) {
        // the caster named by the sim's spawn event, where it stood when it made the call
        const best = sp.by === null ? 1e9 : sp.by;
        if (best <= summonX) { r.how = 'summon'; r.d = +best.toFixed(2); }
      }
      rows.push(r);
    }
  }
  return { rows, startRoom, phase: B.phase, wave: B.wave, t: B.t, frames, gates: !!W.gateList, campN: (B.campN || 0) };
};

const srv = await serve(); const br = await launch();
let all = 0; let open = 0;
try {
  for (const st of STAGES) {
    const r = await openPage(br, srv.base, 'xiaomi', `autostart=1&stage=${st}&noaudio=1&seed=${st}&q=low&autopick=1&autoult=1`, { freeze: true });
    const o = await r.page.evaluate(PLAY, [LIMIT, GATE_X, SUMMON_X]);
    const n = o.rows.length; const by = (h) => o.rows.filter((x) => x.how === h).length;
    const bad = o.rows.filter((x) => x.how === 'open'); all += n; open += bad.length;
    console.log(`stage ${st}: ended ${o.phase} at wave ${o.wave}, t ${o.t.toFixed(1)} s, ${o.frames} frames; ${n} monsters seen: placed ${by('placed')}, gate ${by('gate')}, summon ${by('summon')}, open space ${bad.length} (of which drawn below the floor, climbing: ${bad.filter((x) => x.below).length})`);
    for (const x of bad.slice(0, 4)) console.log(`   open: uid ${x.uid} ${x.kind} wave ${x.wave} t ${x.t} at screen ${x.px},${x.py} (pad ${x.sec + 1}${x.busy ? ', mid-run' : ''}${x.below ? ', below the floor' : ''}${x.d !== null ? ', nearest open gate ' + x.d + ' m' : ''})`);
    check(n > 0, `stage ${st}: ${n} monsters reached the frame`);
    check(bad.length === 0, `stage ${st}: monsters appearing in open space ${bad.length} of ${n} (= 0; placed ${by('placed')}, gate within ${GATE_X} m ${by('gate')}, summoned within ${SUMMON_X} m of the caster ${by('summon')})`);
    check(o.startRoom.has && o.startRoom.onFloor === 0, `stage ${st}: the stage starts in a start room (${o.startRoom.has ? 'pad ' + (o.startRoom.sec + 1) : 'none'}) with ${o.startRoom.onFloor} monsters on its floor at t = 0 (= 0)`);
    check(r.problems.length === 0, `stage ${st}: no page errors (${r.problems.slice(0, 2).join(' | ') || 'none'})`);
    await r.ctx.close();
  }
} finally { await br.close(); srv.close(); }
console.log(`total: ${all} monsters, ${open} in open space; elapsed ${Math.round((Date.now() - T0) / 1000)} s`);
done();
