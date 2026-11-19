#!/usr/bin/env node
// Checks js/housegen.js: 5 themes x 5 houses x N seeds. Exit 1 on any failure.
//   node tools/house-check.js [--seeds 20] [--maps <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = +arg('seeds', 20);
const MAPS = arg('maps', require('./pw.js').scratch('houses'));
const THEMES = ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum'];

(async () => {
  const G = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'housegen.js')).href);
  const D = await import(pathToFileURL(path.join(__dirname, '..', 'data', 'rooms.js')).href);
  const F = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'floors.js')).href);
  const { generateHouse, houseSpec, floodWalk, floodCart, cartPassable: cartPassableAt, asciiMap, FLOOR, DOOR } = G;
  const failures = [];
  const fail = (tag, msg) => { if (failures.length < 40) failures.push(tag + ': ' + msg); failures.n = (failures.n || 0) + 1; };
  const rows = [];

  for (const theme of THEMES) for (let hi = 1; hi <= 5; hi++) {
    const spec = houseSpec(theme, hi);
    const row = { theme, hi, ok: 0, bad: 0, ms: 0, maxMs: 0, rooms: 0, jam: 0, dropped: 0, minLoot: 1e9, retries: 0, padCartOk: 0, padN: 0 };
    for (let s = 1; s <= SEEDS; s++) {
      const tag = `${theme} h${hi} seed${s}`;
      let h, bad = 0;
      const t0 = Date.now();
      try { h = generateHouse({ theme, houseIndex: hi, seed: s * 7919 + hi }); }
      catch (e) { fail(tag, 'generate threw: ' + e.message); row.bad++; continue; }
      const ms = Date.now() - t0; row.ms += ms; row.maxMs = Math.max(row.maxMs, ms);
      const need = (ok, msg) => { if (!ok) { fail(tag, msg); bad++; } };
      const { w, h: H, grid, block } = h;

      // 1. counts per kind
      const cnt = { truck: 0, shared: 0, short: 0, long: 0, private: 0, extract: 0, special: 0, other: 0 };
      for (const r of h.rooms) {
        if (r.kind === 'truck') cnt.truck++;
        else if (r.kind === 'shared') cnt.shared++;
        else if (r.kind === 'corridor') (r.size === 'short' ? cnt.short++ : cnt.long++);
        else if (r.kind === 'private') cnt.private++;
        else if (r.kind === 'extract') cnt.extract++;
        else if (r.kind === 'special') cnt.special++;
        else cnt.other++;
      }
      need(cnt.truck === 1 && h.rooms[0].kind === 'truck', `truck rooms ${cnt.truck}`);
      need(cnt.shared === spec.sharedRooms, `shared ${cnt.shared}/${spec.sharedRooms}`);
      need(cnt.private === spec.privateRooms, `private ${cnt.private}/${spec.privateRooms}`);
      need(cnt.short === spec.shortCorridors, `short corridors ${cnt.short}/${spec.shortCorridors}`);
      need(cnt.long === spec.longCorridors, `long corridors ${cnt.long}/${spec.longCorridors}`);
      need(cnt.extract + cnt.special === spec.extractRooms, `extract ${cnt.extract + cnt.special}/${spec.extractRooms}`);
      need(spec.specialExtract ? cnt.extract === 0 : cnt.special === 0, `extract kind vs specialExtract=${spec.specialExtract}`);
      need(cnt.other === 0, 'unexpected room kind');
      need(h.rooms.length === 1 + spec.sharedRooms + spec.privateRooms + spec.shortCorridors + spec.longCorridors + spec.extractRooms, `room total ${h.rooms.length}`);

      // 2. pads: extract + 1, first in the truck room, one room each, on cart-passable floor, cart-reachable
      need(h.pads.length === spec.extractRooms + 1, `pads ${h.pads.length}/${spec.extractRooms + 1}`);
      need(h.pads[0] && h.pads[0].roomId === 0, 'first pad not in the truck room');
      need(h.meta.cartRoutes === true, 'door-level cart route to every extract room not met');
      const padCart = [];
      need(new Set(h.pads.map((p) => p.roomId)).size === h.pads.length, 'two pads share a room');
      const st = h.start, cart = floodCart(h, st.x, st.y), walk = floodWalk(h, st.x, st.y);
      need(grid[st.y * w + st.x] === FLOOR && cart[st.y * w + st.x] === 1, 'start cell not cart-passable');
      for (const p of h.pads) {
        const i = p.y * w + p.x, r = h.rooms[p.roomId];
        need(p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h, `pad ${p.order} outside its room`);
        need(grid[i] === FLOOR && !block[i], `pad ${p.order} not on free floor`);
        // The source only demands a 3x3 free spot for the pad (G03_World_a.cs roomPoint) and a door-level cart route
        // (HouseGen.CartReachesExtract); RoomCheck.CART_CLEARANCE: "no cart-lane rule between doors any more".
        need(cartPassableAt(h, p.x, p.y), `pad ${p.order} has no 3x3 free floor around it`);
        padCart[p.order] = cart[i] === 1; if (cart[i] === 1) row.padCartOk++; row.padN++;
        if (p.button) { const b = Math.floor(p.button.y) * w + Math.floor(p.button.x); need(walk[b] === 1, `pad ${p.order} button unreachable`); }
      }

      // 3. loot / foe spots reachable on foot from the truck, none in the truck room or a pad room
      need(h.loot.length > 0, 'no loot spots');
      for (const q of h.loot) {
        const i = q.y * w + q.x;
        if (q.place === 'floor') need(walk[i] === 1, `loot (${q.x},${q.y}) unreachable`);
        need(!h.padRooms.includes(q.roomId), `loot (${q.x},${q.y}) in truck/pad room ${q.roomId}`);
        if (bad > 8) break;
      }
      for (const q of h.foes) need(walk[q.y * w + q.x] === 1, `foe spot (${q.x},${q.y}) unreachable`);
      // every walkable floor cell outside blocked props is on foot reachable (the house is one connected piece)
      let floorCells = 0, reached = 0;
      for (let i = 0; i < grid.length; i++) if ((grid[i] === FLOOR || grid[i] === DOOR) && !block[i]) { floorCells++; if (walk[i]) reached++; }
      need(reached / floorCells > 0.97, `only ${(100 * reached / floorCells).toFixed(1)}% of floor reachable on foot`);

      // 4. rooms: no overlap, forbidden 1-tile gap, inside the map
      for (let a = 0; a < h.rooms.length; a++) {
        const A = h.rooms[a];
        need(A.x >= 0 && A.y >= 0 && A.x + A.w <= w && A.y + A.h <= H, `room ${a} outside the map`);
        for (let b = a + 1; b < h.rooms.length; b++) {
          const B = h.rooms[b];
          const gapX = A.x >= B.x + B.w ? A.x - (B.x + B.w) : B.x >= A.x + A.w ? B.x - (A.x + A.w) : -1;
          const gapY = A.y >= B.y + B.h ? A.y - (B.y + B.h) : B.y >= A.y + A.h ? B.y - (A.y + A.h) : -1;
          need(!(gapX < 0 && gapY < 0), `rooms ${a} and ${b} overlap`);
          need(!(gapX === 1 && gapY < 0) && !(gapY === 1 && gapX < 0), `rooms ${a} and ${b} are 1 tile apart`);
        }
      }

      // 5. connectors: tree (n-1 doors, connected), zone 3 wide, every zone cell is door floor
      const loops = (h.stairs || []).filter((st) => st.loop).length;   // floors: the second stair adds one door (a loop)
      need(h.doors.length === h.rooms.length - 1 + loops, `doors ${h.doors.length} for ${h.rooms.length} rooms (+${loops} loop): not a tree plus loops`);
      const adj = h.rooms.map(() => []);
      for (const d of h.doors) {
        adj[d.a].push(d.b); adj[d.b].push(d.a);
        need(Math.min(d.zw, d.zh) >= 2 && Math.max(d.zw, d.zh) >= 3 && (d.dir === 0 ? d.zh === 3 : d.zw === 3), `door at (${d.x},${d.y}) zone ${d.zw}x${d.zh} is not 3 wide`);
        for (let y = d.y0; y < d.y0 + d.zh; y++) for (let x = d.x0; x < d.x0 + d.zw; x++) if (grid[y * w + x] !== DOOR) { need(false, `door zone cell (${x},${y}) not door floor`); }
      }
      const dist = new Array(h.rooms.length).fill(-1); dist[0] = 0;
      for (let q = [0], i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (dist[v] < 0) { dist[v] = dist[q[i]] + 1; q.push(v); }
      need(dist.every((d) => d >= 0), 'rooms not all connected through doors');
      // pad spacing in doors (HouseGen.PadsSpaced): every pair >= MIN_PAD_SPACING doors apart
      const bfs = (s) => { const d = new Array(h.rooms.length).fill(-1); d[s] = 0; for (let q = [s], i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (d[v] < 0) { d[v] = d[q[i]] + 1; q.push(v); } return d; };
      for (let i = 0; i < h.pads.length; i++) { const d = bfs(h.pads[i].roomId); for (let j = i + 1; j < h.pads.length; j++) need(d[h.pads[j].roomId] >= D.MIN_PAD_SPACING, `pads ${i}/${j} only ${d[h.pads[j].roomId]} doors apart`); }

      // 6. jammed doors never cut the truck from a pad (cart) and never seal more than 30% of the floor
      const jam = h.doors.filter((d) => d.jammed);
      if (hi === 1) need(jam.length === 0, 'house 1 has jammed doors');
      if (jam.length) {
        const mask = new Uint8Array(w * H);
        for (const d of jam) for (const [x, y] of (d.dir === 0 ? [[d.x, d.y - 1], [d.x, d.y], [d.x, d.y + 1]] : [[d.x - 1, d.y], [d.x, d.y], [d.x + 1, d.y]])) mask[y * w + x] = 1;
        const cartJ = floodCart(h, st.x, st.y, mask);
        for (const p of h.pads) need(!padCart[p.order] || cartJ[p.y * w + p.x] === 1, `jammed doors cut cart access to pad ${p.order}`);
        const walkJ = floodWalk(h, st.x, st.y, mask);
        let lost = 0; for (let i = 0; i < walk.length; i++) if (walk[i] && !mask[i] && !walkJ[i]) lost++;
        need(lost <= 0.3 * floorCells + 1, `jammed doors seal ${lost} floor cells`);
      }

      // 8. floors (js/floors.js, new design): levels per house, >= 3 rooms per extra floor, truck and one pad on the ground,
      // every stair a 3 x RAMP_LEN ramp from its door height to its room height, every room reachable on foot through the
      // stairs, the cart (3x3, step-aware) runs the whole length of every ramp, houses 3-5 have a loop
      if (h.floorOf) {
        const want = F.floorPlan(hi), lv = [...new Set(h.rooms.map((r) => r.floor))].sort().join();
        need(lv === [0, ...want].sort().join(), `floors ${lv}, want ${[0, ...want].join()}`);
        for (const f of want) { const n = h.rooms.filter((r) => r.floor === f && r.kind !== 'corridor').length; need(n >= 3, `floor ${f} has ${n} rooms (< 3)`); }
        need(h.rooms[0].floor === 0, 'truck room not on the ground floor');
        need(h.pads.some((p) => h.rooms[p.roomId].floor === 0), 'no pad on the ground floor');
        for (const stp of h.stairs) {
          const along = stp.axis === 0 ? stp.x1 - stp.x0 : stp.y1 - stp.y0, across = stp.axis === 0 ? stp.y1 - stp.y0 : stp.x1 - stp.x0;
          need(along === F.RAMP_LEN && across === 3, `stair in room ${stp.room} is ${along}x${across}`);
          need(Math.abs(Math.abs(stp.hS - stp.hD) - F.FLOOR_DY) < 1e-6, `stair in room ${stp.room} climbs ${stp.hS - stp.hD} m`);
          const mid = stp.axis === 0 ? (stp.y0 + stp.y1) / 2 : (stp.x0 + stp.x1) / 2, at = (u) => (stp.axis === 0 ? [u, mid] : [mid, u]);
          const hA = F.heightAt(h, ...at(stp.e0 + stp.sgn * 0.01)), hB = F.heightAt(h, ...at(stp.e0 + stp.sgn * (F.RAMP_LEN - 0.01)));
          need(Math.abs(hA - stp.hD) < 0.02 && Math.abs(hB - stp.hS) < 0.02, `ramp heights ${hA.toFixed(2)}..${hB.toFixed(2)} vs door ${stp.hD} room ${stp.hS}`);
          // a cart put down in the stair door runs to the landing past the ramp's top (the cart's own reach from the truck
          // depends on furniture, as in the one-floor game)
          const [dx0, dz0] = at(stp.e0 - stp.sgn * 0.5), local = floodCart(h, Math.floor(dx0), Math.floor(dz0));
          let cartAll = local[Math.floor(dz0) * w + Math.floor(dx0)] === 1;
          for (let k = 0; k <= F.RAMP_LEN; k++) { const [x, y] = at(stp.e0 + stp.sgn * (k + 0.5)); if (!local[Math.floor(y) * w + Math.floor(x)]) cartAll = false; }
          need(cartAll, `cart cannot run the stair in room ${stp.room} end to end`); if (cartAll) row.stairCart = (row.stairCart || 0) + 1; row.stairs = (row.stairs || 0) + 1;
        }
        for (const r of h.rooms) { let any = false; for (let y = r.y; y < r.y + r.h && !any; y++) for (let x = r.x; x < r.x + r.w; x++) if (walk[y * w + x]) { any = true; break; } need(any, `room ${r.id} (floor ${r.floor}) unreachable on foot`); }
        if (want.length > 1) need(h.floors.loop && loops === 1, 'house 3-5 without a loop between floors');
      }

      // 7. determinism
      if (s <= 2) {
        const h2 = generateHouse({ theme, houseIndex: hi, seed: s * 7919 + hi });
        let same = h2.w === w && h2.rooms.length === h.rooms.length;
        for (let i = 0; same && i < grid.length; i++) if (grid[i] !== h2.grid[i]) same = false;
        need(same, 'same seed gave a different house');
      }

      row.rooms += h.rooms.length; row.jam += jam.length; row.dropped += h.droppedLoot; row.minLoot = Math.min(row.minLoot, h.loot.length); row.retries += h.meta.attempt;
      if (bad) row.bad++; else row.ok++;
      if (theme === 'vampire' && (hi === 1 || hi === 5) && s === 1 && MAPS) {
        fs.mkdirSync(MAPS, { recursive: true });
        const head = `${theme} house ${hi} seed ${s * 7919 + hi}: ${w}x${H} tiles, rooms ${h.rooms.map((r) => r.kind[0] + ':' + r.template).join(', ')}\n` +
          `legend: # wall  . floor  F prop  + connector zone  J jammed door  T cart start  digits = pads in order\n`;
        fs.writeFileSync(path.join(MAPS, `vampire-h${hi}.txt`), head + asciiMap(h) + '\n');
      }
    }
    rows.push(row);
  }

  const pad = (s, n) => String(s).padStart(n);
  console.log('theme        house  ok/total  rooms  jam  droppedLoot  minLoot  avg ms  max ms  avg attempt  padCart%');
  let okAll = 0, total = 0;
  for (const r of rows) {
    const n = r.ok + r.bad; okAll += r.ok; total += n;
    console.log(`${r.theme.padEnd(12)} ${pad(r.hi, 5)}  ${pad(r.ok + '/' + n, 8)}  ${pad((r.rooms / Math.max(1, r.ok)).toFixed(1), 5)}  ${pad((r.jam / Math.max(1, r.ok)).toFixed(1), 3)}  ${pad((r.dropped / Math.max(1, r.ok)).toFixed(2), 11)}  ${pad(r.minLoot === 1e9 ? '-' : r.minLoot, 7)}  ${pad((r.ms / Math.max(1, n)).toFixed(0), 6)}  ${pad(r.maxMs, 6)}  ${pad((r.retries / Math.max(1, r.ok)).toFixed(1), 11)}  ${pad((100 * r.padCartOk / Math.max(1, r.padN)).toFixed(0), 8)}  stairs ${r.stairCart || 0}/${r.stairs || 0} cart-ok`);
  }
  for (const f of failures) console.log('FAIL ' + f);
  if (failures.n > failures.length) console.log(`... and ${failures.n - failures.length} more failures`);
  console.log(`house-check: ${okAll === total && !failures.n ? 'PASS' : 'FAIL'} ${okAll}/${total} houses (5 themes x 5 houses x ${SEEDS} seeds), ${failures.n || 0} failed assertions`);
  if (MAPS) console.log('maps: ' + MAPS);
  process.exit(okAll === total && !failures.n ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
