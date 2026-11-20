// Jump check (player.js JUMP, foes.js bay; new design, the 2D game has no jump, rules in trail.tsv):
// a jump costs 8 stamina and needs it; carrying lowers it by the carry slow-down (height x speedMul); landing makes noise
// by the drop and sneaking halves it, dips the camera and thumps by floor kind; walking down a ramp is no landing; a drop
// over 3 m hurts (8 + 15 per metre over), 2 m does not; a foe hits a player standing on a table (reach 1.6 m up); a foe
// that cannot reach the player waits under them and shoves the loot around (no idle stare); a jammed door cannot be
// jumped; houses 1-5: a ceiling over every walkable cell (no way out over a wall), nothing a robot can stand on is above
// a foe's reach (truck roof included), and every nav step is walkable without a jump (no rise over the KCC autostep).
// Usage: node tools/jump.js [--houses 1,2,3,4,5]
'use strict';
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const argv = process.argv.slice(2);
const HOUSES = (() => { const i = argv.indexOf('--houses'); return i >= 0 ? argv[i + 1].split(',').map(Number) : [1, 2, 3, 4, 5]; })();
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 400) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = { lands: [] };
  G.events.on('player:land', (e) => T.lands.push(e));
  T.noise = []; const emit0 = G.noise.emit.bind(G.noise); G.noise.emit = (e) => { const r = emit0(e); T.noise.push(r); return r; };
  T.feet = () => P.body.translation().y - 0.83;
  T.at = (x, z, feet, yaw = 0) => { const y = (feet ?? G.house.heightAt(x, z)) + 0.85; P.body.setTranslation({ x, y, z }, true); P.body.setNextKinematicTranslation({ x, y, z }); P.vy = 0; P.yaw = yaw; P.pitch = 0; };
  T.fresh = () => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.hp = 100; P.stamina = 100; P.staminaWait = 0; P.speedMul = 1; T.lands.length = 0; };
  // an open spot: walkable 3x3, flat, at least 'clear' m of air above
  T.open = (clear = 2.6, skip = 0) => { for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i), h = G.house.heightAt(c.x, c.z);
      let flat = true; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(G.house.heightAt(c.x + dx, c.z + dz) - h) > 0.01) flat = false; if (!flat) continue;
      const up = G.phys.castRay({ x: c.x, y: h + 0.05, z: c.z }, { x: 0, y: 1, z: 0 }, 8); const cl = up ? up.toi : 99; if (cl < clear) continue;
      if (skip-- > 0) continue; return { x: c.x, z: c.z, h, cl }; } return null; };
  // jump in place; returns the rise of the feet and the landing record
  T.jump = (crouch = false) => { const y0 = T.feet(); let top = y0; const n0 = T.lands.length;
    __sim(1 / 60, { ...__IDLE, jump: true, crouch }); for (let i = 0; i < 120; i++) { __sim(1 / 60, { ...__IDLE, crouch }); top = Math.max(top, T.feet()); if (P.grounded && i > 5) break; }
    return { rise: +(top - y0).toFixed(3), land: T.lands[n0] || null }; };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, F = G.foes;');

const CASES = {
  'stamina: a jump costs 8; under 8 there is no jump': `(() => { T.fresh(); const o = T.open(); T.at(o.x, o.z); __sim(0.3);
    const s0 = P.stamina, j0 = P.jumps || 0; __sim(1 / 60, { ...__IDLE, jump: true }); const s1 = P.stamina, vy1 = P.vy; __sim(1.2);
    P.stamina = 5; P.staminaWait = 1; const d0 = P.jumpDenied || 0, y0 = T.feet(); __sim(1 / 60, { ...__IDLE, jump: true }); __sim(0.3);
    return { ok: Math.abs(s0 - s1 - 8) < 0.01 && vy1 > 3 && (P.jumps || 0) === j0 + 1 && (P.jumpDenied || 0) === d0 + 1 && Math.abs(T.feet() - y0) < 0.02, cost: +(s0 - s1).toFixed(2), vy1: +vy1.toFixed(2), denied: (P.jumpDenied || 0) - d0 }; })()`,
  'carry: the jump is lower by the carry slow-down (height x speedMul 0.5)': `(() => { T.fresh(); const o = T.open(); T.at(o.x, o.z); __sim(0.3);
    const free = T.jump(); __sim(0.6); P.stamina = 100;
    const y0 = T.feet(); let top = y0; for (let i = 0; i < 90; i++) { __sim(1 / 60, i === 0 ? () => (P.speedMul = 0.5, { ...__IDLE, jump: true }) : () => (P.speedMul = 0.5, __IDLE)); top = Math.max(top, T.feet()); }
    const r = (top - y0) / free.rise; return { ok: free.rise > 0.8 && Math.abs(r - 0.5) < 0.06, free: free.rise, carried: +(top - y0).toFixed(3), ratio: +r.toFixed(3) }; })()`,
  'landing: noise by the drop, sneaking halves it; a land thump by floor kind': `(() => { T.fresh(); const o = T.open(); T.at(o.x, o.z); __sim(0.3);
    const id0 = G.noise.seq || 0, a0 = G.audio.log.length; const a = T.jump(false); __sim(0.5); P.stamina = 100; const b = T.jump(true); __sim(0.3);
    const ev = T.noise.filter((e) => e.id > id0 && e.src === 'land'), snd = G.audio.log.slice(a0).filter((e) => /^land_/.test(e[0])).map((e) => e[0]);
    const want = 'land_' + G.audio.floor();
    return { ok: !!a.land && !!b.land && ev.length === 2 && Math.abs(ev[0].r - (1 + 2.2 * a.land.drop)) < 0.05 && Math.abs(ev[1].r / ev[0].r - b.land.drop / a.land.drop * 0.5) < 0.05 && snd.length === 2 && snd[0] === want,
      drop: [a.land && +a.land.drop.toFixed(2), b.land && +b.land.drop.toFixed(2)], r: ev.map((e) => +e.r.toFixed(2)), snd }; })()`,
  'landing: the camera dips and comes back': `(() => { T.fresh(); const o = T.open(); T.at(o.x, o.z); __sim(0.5); const base = P.camPos.y;
    __sim(1 / 60, { ...__IDLE, jump: true }); let low = 99, landed = false; for (let i = 0; i < 120; i++) { __sim(1 / 60); if (T.lands.length) landed = true; if (landed) low = Math.min(low, P.camPos.y); }
    __sim(1); const back = P.camPos.y;
    return { ok: landed && base - low > 0.05 && Math.abs(back - base) < 0.01, dip: +(base - low).toFixed(3), back: +(back - base).toFixed(4) }; })()`,
  'falls: 2 m does not hurt, 3.5 m does (8 + 15 per m over 2.5 = 23 hp), a teleport is no fall': `(() => { T.fresh(); const o = T.open(5.4); if (!o) return { ok: false, err: 'no tall spot' };
    T.at(o.x, o.z); __sim(0.5); const hp0 = P.hp; T.at(o.x, o.z, o.h + 2); __sim(1.5); const hp2 = P.hp, l2 = P.lastLand;
    T.at(o.x, o.z, o.h + 3.5); __sim(1.8); const hp3 = P.hp, l3 = P.lastLand;
    return { ok: hp0 === 100 && hp2 === 100 && l2 && l2.drop > 1.9 && l3 && l3.drop > 3.4 && hp3 === 100 - l3.dmg && Math.abs(l3.dmg - (8 + (l3.drop - 2.5) * 15)) <= 0.5 && l3.dmg >= 22, spot: o, l2, l3, hp: [hp0, hp2, hp3] }; })()`,
  'falls: stepping off the high end of a stair ramp (open side, ~2.75 m) hurts, makes a loud landing': `(() => { T.fresh(); let best = null;
    for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i]) continue; const c = nav.center(i), h = G.house.heightAt(c.x, c.z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx * 1.2, z = c.z + dz * 1.2, hd = G.house.heightAt(x, z);
        if (h - hd < 2.6 || !nav.okW(x, z) || G.phys.castRay({ x: c.x, y: h + 0.5, z: c.z }, { x: dx, y: 0, z: dz }, 1.5)) continue;
        if (!best || h - hd > best.drop) best = { c, dx, dz, h, drop: h - hd }; } }
    if (!best) return { ok: false, err: 'no open drop' };
    T.at(best.c.x, best.c.z, undefined, Math.atan2(-best.dx, -best.dz)); __sim(0.3); const id0 = G.noise.seq || 0, f0 = T.feet();
    let off = false; __sim(2, () => (off = off || !P.grounded, { ...__IDLE, mz: off ? 0 : 1 })); const l = P.lastLand, ev = T.noise.filter((e) => e.id > id0 && e.src === 'land');   // stop pushing once off the edge
    return { ok: !!l && l.drop > 2.5 && Math.abs(l.dmg - Math.round(8 + (l.drop - 2.5) * 15)) <= 1 && l.dmg >= 8 && P.hp === 100 - l.dmg && ev.length === 1 && ev[0].r > 6, at: { x: best.c.x, z: best.c.z, drop: +best.drop.toFixed(2) }, from: +f0.toFixed(2), land: l, hp: P.hp, r: ev.map((e) => +e.r.toFixed(2)) }; })()`,
  'ramps: walking down a stair ramp is no landing': `(() => { T.fresh(); const L = G.house.layout, st = (L.stairs || [])[0]; if (!st) return { ok: false, err: 'no stairs' };
    const mid = st.axis === 0 ? (st.y0 + st.y1) / 2 : (st.x0 + st.x1) / 2, at = (u) => (st.axis === 0 ? { x: u, z: mid } : { x: mid, z: u });
    G.house.unjam(st.door.x0 + st.door.zw / 2, st.door.y0 + st.door.zh / 2, 0.5);
    const top = at(st.e0 + st.sgn * 7), yawDown = st.axis === 0 ? Math.atan2(st.sgn, 0) : Math.atan2(0, st.sgn);
    T.at(top.x, top.z, undefined, yawDown); __sim(0.4); const f0 = T.feet(); T.lands.length = 0;
    __sim(4, { ...__IDLE, mz: 1, sprint: true }); const f1 = T.feet();
    return { ok: f0 - f1 > 2.5 && T.lands.length === 0, from: +f0.toFixed(2), to: +f1.toFixed(2), lands: T.lands.map((e) => +e.drop.toFixed(2)) }; })()`,
  'a foe hits a player standing on a table (0.78 m, reach 1.6 m up)': `(() => { T.fresh(); const out = [];
    for (const pr of G.house.props.filter((q) => q.blocks && /^(table|desk)$/.test(q.cat))) {
      const base = G.house.heightAt(pr.x, pr.z); let spot = null, me = null;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ext = (dx ? pr.w : pr.d) / 2, x = pr.x + dx * (ext + 0.5), z = pr.z + dz * (ext + 0.5);
        if (nav.okW(x, z) && Math.abs(G.house.heightAt(x, z) - base) < 0.01 && !G.phys.castRay({ x, y: base + 0.3, z }, { x: 0, y: 1, z: 0 }, 1.6)) { spot = { x, z }; me = { x: pr.x + dx * Math.max(0, ext - 0.45), z: pr.z + dz * Math.max(0, ext - 0.45) }; break; } }
      if (!spot) continue;
      T.fresh(); T.at(me.x, me.z, base + pr.h + 0.03); __sim(0.4); const on = T.feet() - base;
      if (Math.abs(on - pr.h) > 0.08 || !P.grounded) { out.push({ n: pr.n, skip: 'not on top', on: +on.toFixed(2) }); continue; }
      const f = F.spawn('mummy', spot.x, spot.z, { sleep: 0 }); f.aware = 1; f.lastSeen = { x: pr.x, z: pr.z }; F.setState(f, 'chase'); f.seen = true;
      for (let i = 0; i < 360 && P.hp === 100; i++) __sim(1 / 60);
      const hit = P.hp < 100, still = T.feet() - base; F.remove(f);
      out.push({ n: pr.n, h: pr.h, on: +on.toFixed(2), hit, still: +still.toFixed(2) });
      if (hit && still > pr.h - 0.1) return { ok: true, table: out[out.length - 1], tried: out.length };
      if (out.length > 6) break; }
    return { ok: false, tried: out }; })()`,
  'out of reach: the foe waits under the player and shoves the loot around, no hit': `(() => { T.fresh(); const o = T.open(4.0); if (!o) return { ok: false, err: 'no tall spot' };
    const col = G.phys.fixedBox(o.x, o.h + 1.0, o.z, 0.3, 1.0, 0.3); T.at(o.x, o.z, o.h + 2.03); __sim(0.4); const on = T.feet() - o.h;
    let fx = null; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (nav.okW(o.x + dx * 0.95, o.z + dz * 0.95)) { fx = { x: o.x + dx * 0.95, z: o.z + dz * 0.95, dx, dz }; break; }
    const it = G.loot.items.find((q) => !q.dead && !q.held); const ix = fx.x + fx.dz * 0.5 + fx.dx * 0.3, iz = fx.z + fx.dx * 0.5 + fx.dz * 0.3;
    it.body.setTranslation({ x: ix, y: o.h + 0.35, z: iz }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const f = F.spawn('mummy', fx.x, fx.z, { sleep: 0 }); f.aware = 1; f.lastSeen = { x: o.x, z: o.z }; F.setState(f, 'chase'); f.seen = true;
    const n0 = F.log.length; let baying = 0; for (let i = 0; i < 300; i++) { __sim(1 / 60); if (f.baying) baying++; }
    const bays = F.log.slice(n0).filter((e) => e[0] === 'bay'), t = it.body.translation(), moved = Math.hypot(t.x - ix, t.z - iz), hp = P.hp, st = T.feet() - o.h;
    F.remove(f); G.phys.world.removeRigidBody(col);
    return { ok: Math.abs(on - 2.0) < 0.08 && hp === 100 && bays.length >= 2 && baying > 200 && moved > 0.3 && st > 1.9, on: +on.toFixed(2), hp, bays: bays.length, baying, moved: +moved.toFixed(2) }; })()`,
  'a jammed door cannot be jumped over or through': `(() => { T.fresh(); const out = [];
    for (const d of G.house.doors.filter((q) => q.jammed)) {
      let a = null, b = null;
      for (const [dx, dz] of [[1, 0], [0, 1]]) for (const u of [1.0, 1.5, 2.0]) { if (a) break; const A = { x: d.x - dx * u, z: d.z - dz * u }, B = { x: d.x + dx * u, z: d.z + dz * u };
        if (nav.okW(A.x, A.z) && nav.okW(B.x, B.z) && Math.abs(G.house.heightAt(A.x, A.z) - G.house.heightAt(B.x, B.z)) < 0.01) { a = A; b = B; } }
      if (!a) { out.push({ skip: d }); continue; }
      T.fresh(); T.at(a.x, a.z, undefined, Math.atan2(-(b.x - a.x), -(b.z - a.z))); __sim(0.3);
      __sim(5, (i) => { P.stamina = 100; return { ...__IDLE, mz: 1, sprint: true, jump: i % 30 === 0 }; });
      const t = P.body.translation(), L2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2, along = ((t.x - a.x) * (b.x - a.x) + (t.z - a.z) * (b.z - a.z)) / L2, da = along, db = 1 - along;
      out.push({ along: +along.toFixed(2), da: +da.toFixed(2), db: +db.toFixed(2), jumps: P.jumps }); if (out.filter((r) => !r.skip).length >= 3) break; }
    const done = out.filter((r) => !r.skip); return { ok: done.length > 0 && done.every((r) => r.da < r.db), doors: out }; })()`,
};

// per house: closed above, nothing standable out of reach, no jump needed on any nav step
const HOUSE = `(() => { const G = __G, nav = G.foes.nav, P = G.player, cap = 2 * (0.52 + 0.31), reachY = 1.6, auto = 0.32;
  let open = 0, cells = 0; const openAt = [];
  for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i]) continue; cells++; const c = nav.center(i), h = G.house.heightAt(c.x, c.z);
    const up = G.phys.castRay({ x: c.x, y: h + 0.05, z: c.z }, { x: 0, y: 1, z: 0 }, 9); if (!up) { open++; if (openAt.length < 4) openAt.push(c); } }
  let tallest = 0, tallestN = '', blocked = 0; const props = G.house.props.filter((q) => q.blocks && q.h > 0.3);
  for (const q of props) { const base = G.house.heightAt(q.x, q.z), top = base + q.h;
    const up = G.phys.castRay({ x: q.x, y: top + 0.02, z: q.z }, { x: 0, y: 1, z: 0 }, 9), room = up ? up.toi : 99;
    if (room >= cap + 0.02) { if (q.h > tallest) { tallest = q.h; tallestN = q.n; } } else blocked++; }
  let truck = null; if (G.truck) { const tx = G.truck.x, tz = G.truck.z, dn = G.phys.castRay({ x: tx, y: 2.75, z: tz }, { x: 0, y: -1, z: 0 }, 3), roof = dn ? 2.75 - dn.toi : 0;
    const up = G.phys.castRay({ x: tx, y: roof + 0.02, z: tz }, { x: 0, y: 1, z: 0 }, 9); truck = { roof: +roof.toFixed(2), room: up ? +up.toi.toFixed(2) : 99 }; }
  let steps = 0, worst = 0, worstAt = null;
  for (let y = 0; y < nav.H; y++) for (let x = 0; x < nav.W; x++) { const i = y * nav.W + x; if (!nav.walk[i]) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const j = (y + dy) * nav.W + x + dx; if (x + dx >= nav.W || y + dy >= nav.H || !nav.walk[j] || !nav.step(i, j)) continue; steps++;
      let prev = G.house.heightAt(x + 0.5, y + 0.5); for (let s = 1; s <= 20; s++) { const h = G.house.heightAt(x + 0.5 + dx * s / 20, y + 0.5 + dy * s / 20); const d = Math.abs(h - prev); if (d > worst) { worst = d; worstAt = { x, y, dx, dy }; } prev = h; } } }
  return { cells, open, openAt, props: props.length, blocked, tallest, tallestN, truck, steps, worst: +worst.toFixed(3), worstAt, cap, reachY, auto }; })()`;

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
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=3&seed=7&foes=none&bots=0&passives=0');
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    for (const hi of HOUSES) {
      ({ ctx, page, logs } = await open(br, srv, `house=${hi}&seed=7&foes=none&bots=0&passives=0`));
      const r = await page.evaluate(HOUSE);
      check(r.open === 0, `house ${hi}: a ceiling over every walkable cell (${r.cells}), no way out over a wall`, { open: r.open, at: r.openAt });
      check(r.tallest < r.reachY && r.tallest + r.cap > 0, `house ${hi}: the tallest standable thing (${r.tallest} m, ${r.tallestN}) is under a foe's reach ${r.reachY} m`, { tallest: r.tallest, n: r.tallestN, blocked: r.blocked, of: r.props });
      check(!r.truck || r.truck.room < r.cap, `house ${hi}: no room for a robot on the truck roof`, r.truck);
      check(r.steps > 100 && r.worst <= r.auto, `house ${hi}: every nav step (${r.steps}) rises at most ${r.auto} m at once (no jump needed)`, { worst: r.worst, at: r.worstAt });
      await ctx.close();
    }
  } catch (e) { check(false, 'run', e.message.slice(0, 400)); }
  clearTimeout(kill);
  await br.close(); srv.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} pass`);
  process.exit(bad.length ? 1 : 0);
})();
