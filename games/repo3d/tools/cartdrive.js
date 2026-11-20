// Cart driving bot (batch 6f item 3, owner: "kéo cart cứ kẹt"). In each house the player grabs the parked cart by its bar
// with the beam and pushes it from the truck to every pad and to every room with loot, along a cart route (Dijkstra over nav
// cells keeping off walls and furniture, through doors and up/down stairs). The driver acts as a player does: it looks along
// the route only as far as the cart can roll straight (round a corner once there) and steps aside when it walks into something.
// Stall: the cart moving less than 15 cm in 1 s while held; its cause is read from the cart's contacts (door leaf, door frame,
// stair edge, loot, wall, decor, the pusher). Also beam snaps (where) and routes that make no progress for 6 s.
// Usage: node tools/cartdrive.js [--themes a,b] [--houses 1,2,3,4,5] [--seeds 7,8] [--max-targets 4]
//   --shot: stop at the first stall, screenshots + a 15 x 15 cell map round it (# wall, p furniture, D door, s stair, ^/v floor
//           higher/lower, * route, C cart, P player, G goal) + what touches the player
//   --naive: the earlier driver (looks 2 m along the route across corners, never steps aside), to tell cart fixes from driving
//   --trace N [--fine]: print route N every 0.5 s (0.1 s)
'use strict';
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const THEMES = arg('--themes', 'vampire,pyramid,vietnam,spacestation,asylum').split(','), HOUSES = arg('--houses', '1,2,3,4,5').split(',').map(Number);
const SHOT = argv.includes('--shot');
const FINE = argv.includes("--fine"), NAIVE = argv.includes("--naive");   // --naive: the earlier bot (looks 2 m ahead across corners, never steps aside)
const TRACE = argv.includes('--trace') ? +arg('--trace', 1) : 0;
const SEEDS = arg('--seeds', '7,8').split(',').map(Number), MAXT = +arg('--max-targets', 4);

const DRIVE = `(async () => { const G = __G, P = G.player, nav = G.foes.nav, L = G.house.layout, W = L.w, C = G.cart; window.__paused = true; __sim(0.5);
  const HG = await import('/games/repo3d/js/housegen.js'), FLR = await import('/games/repo3d/js/floors.js');
  const ok = (x, y) => HG.cartPassable(L, x, y);
  const bfs = (sx, sy, tx, ty) => { const prev = new Map(), s = sy * W + sx, t = ty * W + tx; prev.set(s, -1); const q = [s];
    for (let h = 0; h < q.length; h++) { const i = q[h]; if (i === t) break; const x = i % W, y = Math.floor(i / W);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const j = ny * W + nx; if (prev.has(j) || !ok(nx, ny) || !FLR.stepOK(L, i, j)) continue; prev.set(j, i); q.push(j); } }
    if (!prev.has(t)) return null; const out = []; for (let i = t; i !== -1; i = prev.get(i)) out.push({ x: i % W + 0.5, z: Math.floor(i / W) + 0.5 }); return out.reverse(); };
  // the route a careful player pushes along: walkable cells (stairs by floors.stepOK), Dijkstra that keeps off cells next to
  // a wall or prop (a cell 1 from a blocked one costs 6, 2 from one costs 2), every cell centre a waypoint (no string-pulling)
  // things the nav grid does not know (the truck, furniture the layout calls non-blocking): a fixed collider at the cart's height
  const solidC = new Map(), RR = G.phys.R, probe = new RR.Cuboid(0.45, 0.25, 0.45), propH = new Set(); for (const pr of G.house.props) for (const b of pr.bodies || []) propH.add(b.handle);
  const solid = (x, y) => { const k = y * W + x; if (solidC.has(k)) return solidC.get(k); let hitAny = false; const cx = x + 0.5, cz = y + 0.5;   // furniture reaching into the cell at the cart's height
    if (nav.ok(x, y)) G.phys.world.intersectionsWithShape({ x: cx, y: G.house.heightAt(cx, cz) + 0.45, z: cz }, { x: 0, y: 0, z: 0, w: 1 }, probe, (col) => { if (propH.has(col.parent().handle)) { hitAny = true; return false; } return true; }, RR.QueryFilterFlags.EXCLUDE_SENSORS | RR.QueryFilterFlags.EXCLUDE_DYNAMIC | RR.QueryFilterFlags.EXCLUDE_KINEMATIC);
    solidC.set(k, hitAny); return hitAny; };
  const route = (sx, sy, tx, ty) => { const N = W * L.h, dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), s0 = sy * W + sx, t0 = ty * W + tx, open = [s0]; dist[s0] = 0;
    while (open.length) { let bi = 0; for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k; const i = open[bi]; open[bi] = open[open.length - 1]; open.pop(); if (i === t0) break;
      const x = i % W, y = Math.floor(i / W); for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (!nav.ok(nx, ny)) continue; const j = ny * W + nx; if (!nav.step(i, j)) continue;
        const sn = solid(nx + 1, ny) || solid(nx - 1, ny) || solid(nx, ny + 1) || solid(nx, ny - 1) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => nav.ok(nx + ex, ny + ey) && !nav.step(j, (ny + ey) * W + nx + ex));   // beside a drop (a ramp's open side): keep off it
        const c = dist[i] + 1 + (solid(nx, ny) ? 12 : 0) + (nav.near[j] === 1 || sn ? 20 : nav.near[j] === 2 ? 3 : 0); if (c < dist[j]) { if (dist[j] >= 1e9) open.push(j); dist[j] = c; prev[j] = i; } } }
    if (dist[t0] >= 1e9) return null; const out = []; for (let i = t0; i !== -1; i = prev[i]) out.push({ x: i % W + 0.5, z: Math.floor(i / W) + 0.5 }); return out.reverse(); };
  const nearOk = (x, y) => { let best = null; for (let r = 0; r < 6 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!best && nav.okW(x + dx + 0.5, y + dy + 0.5) && nav.near[nav.nearest(x + dx + 0.5, y + dy + 0.5, 0)] >= 2) best = { x: x + dx, y: y + dy }; return best; };
  // a straight roll from the cart to q: every 0.25 m the cart's width (0.36 m + 0.1 each side) on walkable floor, no furniture at
  // the cart's height, and no step in the floor (a ramp rises 0.125 m per 0.25 m)
  const see = (a, q) => { const dx = q.x - a.x, dz = q.z - a.z, d = Math.hypot(dx, dz); if (d < 0.3) return true; const ux = dx / d, uz = dz / d; let hp = G.house.heightAt(a.x, a.z);
    for (let u = 0.25; u <= d + 0.01; u += 0.25) { const x = a.x + ux * u, z = a.z + uz * u, h = G.house.heightAt(x, z); if (Math.abs(h - hp) > 0.2) return false; hp = h;
      for (const w of [-0.46, 0, 0.46]) { const px = x - uz * w, pz = z + ux * w; if (!nav.okW(px, pz) || solid(Math.floor(px), Math.floor(pz)) || Math.abs(G.house.heightAt(px, pz) - h) > 0.2) return false; } } return true; };
  const park = { ...C.body.translation() }, parkRot = { ...C.body.rotation() };
  const propOf = new Map(); for (const pr of G.house.props) for (const b of pr.bodies || []) propOf.set(b.handle, pr.n);
  const what = (col) => { if (!col) return 'nothing'; const b = col.parent(); if (!b) return '?'; if (propOf.has(b.handle)) return 'prop:' + propOf.get(b.handle); if (G.house.stairCols?.has?.(b)) return 'stair';
    if (G.house.doorRecs?.some((d) => d.leaves.some((l) => l.body === b))) return 'door'; if (G.phys.props.some((q) => q.body === b && !q.isCart)) return 'loot'; if (b.isFixed()) return 'wall/floor'; return b.isKinematic() ? 'kinematic' : 'dynamic'; };
  // targets: every pad, then rooms with loot (up to MAXT in all)
  const targets = []; for (const pd of L.pads) targets.push({ kind: 'pad', x: Math.floor(pd.x), y: Math.floor(pd.y) });
  const seenRooms = new Set(L.pads.map((p) => p.roomId)); seenRooms.add(0);
  for (const l of L.loot) { if (targets.length >= ${MAXT}) break; if (seenRooms.has(l.roomId)) continue; seenRooms.add(l.roomId); const r = L.rooms[l.roomId]; targets.push({ kind: 'room', x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) }); }
  const res = { routes: 0, arrived: 0, stalls: 0, snaps: 0, snapWhy: {}, at: [], byKind: {}, backoffs: 0, failed: [], blockers: {}, simS: 0 };
  for (const tg of targets.slice(0, ${MAXT})) {
    // reset: cart parked, player behind its bar, facing it, beam on the bar
    C.body.setTranslation(park, true); C.body.setRotation(parkRot, true); C.body.setLinvel({ x: 0, y: 0, z: 0 }, true); C.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const it of G.loot.items) if (C.load().includes(it)) it.body.setTranslation({ x: it.body.translation().x + 5, y: 5, z: it.body.translation().z }, true);
    if (G.grab.held) G.grab.release(false); __sim(0.2);
    const ct = C.body.translation(), cs = nearOk(Math.floor(ct.x), Math.floor(ct.z)), te = nearOk(tg.x, tg.y);
    if (!cs || !te) { if (tg.kind === 'room') (res.skipped = res.skipped || []).push(tg); else res.failed.push({ tg, why: 'no cart cell' }); continue; }   // a loot room too cramped for a cart is skipped (the 2D rule guarantees pads only)
    const path = route(cs.x, cs.y, te.x, te.y); if (!path || path.length < 2) { res.failed.push({ tg, why: 'no path' }); continue; }
    res.routes++; if (res.routes === ${TRACE}) res.path0 = path.map((q) => [+q.x.toFixed(1), +q.z.toFixed(1)]);
    const bar = C.bar.translation(), fx = path.length > 2 ? path[2].x - ct.x : 1, fz = path.length > 2 ? path[2].z - ct.z : 0, fl = Math.hypot(fx, fz) || 1;
    const sx = ct.x - fx / fl * 1.9, sz = ct.z - fz / fl * 1.9, h0 = G.house.heightAt(sx, sz);
    P.body.setTranslation({ x: sx, y: h0 + 0.85, z: sz }, true); P.body.setNextKinematicTranslation({ x: sx, y: h0 + 0.85, z: sz }); P.vy = 0; __sim(0.05);
    const aim = () => { const b = C.bar.translation(), c = P.camPos; P.yaw = Math.atan2(-(b.x - c.x), -(b.z - c.z)); P.pitch = Math.atan2(b.y - c.y, Math.hypot(b.x - c.x, b.z - c.z)); };
    aim(); __sim(0.02); aim(); if (!G.grab.tryGrab() || G.grab.held !== C.rec) { res.failed.push({ tg, why: 'no grab' }); continue; }
    const hist = [], phist = []; let sideT = 0, sideDir = 1, pBlock = 0, backT = 0, lastGo = 0, idx = 0, t = 0, still = 0, last = { ...C.body.translation() }, stallOpen = false, best = 1e9, sinceBest = 0, arrived = false;
    const goal = path[path.length - 1];
    while (t < 120) {
      const cp = C.body.translation(), pp = P.position;
      { let bd = 1e9, bi = idx; for (let k = idx; k < Math.min(path.length, idx + 8); k++) { const dd = Math.hypot(path[k].x - cp.x, path[k].z - cp.z); if (dd < bd) { bd = dd; bi = k; } } idx = bi; }   // the path point nearest the cart (never back)
      let wi = idx, arc = 0; while (wi < path.length - 1 && arc < 2) { arc += Math.hypot(path[wi + 1].x - path[wi].x, path[wi + 1].z - path[wi].z); wi++; }
      while (!${NAIVE} && wi > idx + 1 && !see(cp, path[wi])) wi--; const wp = path[wi];   // up to 2 m along the route, but only as far as the cart can roll straight to (a player looks along the corridor, then round the corner once there; looking across the corner turned the cart's nose into it)
      const want = Math.atan2(-(wp.x - pp.x), -(wp.z - pp.z)); let d = want - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const held = G.grab.held === C.rec;
      if (!held) { res.snaps++; const w = G.grab.lastBreak?.why || 'released'; (res.snapAt = res.snapAt || []).push({ route: res.routes, t: +t.toFixed(1), cart: [+cp.x.toFixed(1), +cp.z.toFixed(1)], pl: [+pp.x.toFixed(1), +pp.z.toFixed(1)], why: w }); res.snapWhy[w] = (res.snapWhy[w] || 0) + 1; aim(); __sim(0.02); aim(); if (!G.grab.tryGrab() || G.grab.held !== C.rec) { res.failed.push({ tg, why: 'snap, no regrab', at: [+cp.x.toFixed(1), +cp.z.toFixed(1)] }); break; } }
      const lagNow = () => { if (G.grab.held !== C.rec) return 0; const a = G.grab.anchorWorld(new (P.camPos.constructor)()), tg2 = P.camPos.clone().addScaledVector(P.forward(new (P.camPos.constructor)()), G.grab.dist); const f = P.forward(new (P.camPos.constructor)()), fl = Math.hypot(f.x, f.z) || 1, ex = tg2.x - a.x, ez = tg2.z - a.z, ahead = (ex * f.x + ez * f.z) / fl, side = Math.abs(ex * f.z - ez * f.x) / fl; return Math.max(ahead, side); };   // the cart trails its spot, or swings off to a side (one rolling ahead down a ramp is not waited for)
      const step = () => { const q0 = C.body.translation(), p2 = P.position, pi = (() => { let b = 0, bd = 1e9; for (let k = Math.max(0, idx - 14); k <= idx; k++) { const d2 = Math.hypot(path[k].x - p2.x, path[k].z - p2.z) + Math.abs(G.house.heightAt(path[k].x, path[k].z) - (p2.y - 0.83)) * 3; if (d2 < bd) { bd = d2; b = k; } } return b; })(), bk = path[Math.min(pi + 2, Math.max(pi, idx - 1))], q = Math.hypot(q0.x - p2.x, q0.z - p2.z) > 1.4 && Math.hypot(bk.x - p2.x, bk.z - p2.z) > 0.4 && pi < idx - 1 ? bk : q0, dx = q.x - p2.x, dz = q.z - p2.z, dl = Math.max(Math.hypot(dx, dz), Math.hypot(q0.x - p2.x, q0.z - p2.z)) || 1, dl2 = Math.hypot(dx, dz) || 1, go = lagNow() > 0.7 || dl < 1.0 ? 0 : 1, _g = (lastGo = go), sy = Math.sin(P.yaw), cy2 = Math.cos(P.yaw);
        if (sideT > 0) return { mz: 0, mx: sideDir };   // walked into something (an open door leaf across a corridor): a step aside, as a player does
        return { mz: go * (dx / dl2 * -sy + dz / dl2 * -cy2), mx: go * (dx / dl2 * cy2 + dz / dl2 * -sy) }; };   // look at the waypoint, step after the cart (a player sidesteps a door jamb)
      __sim(0.1, () => ({ ...__IDLE, ...step(), dyaw: Math.max(-0.06, Math.min(0.06, -d * 0.3)), dpitch: (P.pitch + 0.25) * 0.2, grab: true }));
      t += 0.1; res.simS += 0.1; backT = Math.max(0, backT - 0.1); sideT = Math.max(0, sideT - 0.1);
      { const pq = phist[phist.length - 1]; pBlock = lastGo && sideT <= 0 && pq && Math.hypot(P.position.x - pq.x, P.position.z - pq.z) < 0.03 ? pBlock + 1 : 0;
        if (pBlock >= 3 && !${NAIVE}) { const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw); sideDir = nav.okW(P.position.x + cy * sideDir * 0.7, P.position.z - sy * sideDir * 0.7) ? sideDir : -sideDir; sideT = 0.5; pBlock = 0; res.sidesteps = (res.sidesteps || 0) + 1; } } if (res.routes === ${TRACE} && (${FINE} || Math.round(t * 10) % 5 === 0)) (res.trace = res.trace || []).push({ t: +t.toFixed(1), cart: [+C.body.translation().x.toFixed(2), +C.body.translation().z.toFixed(2)], cyaw: +(2 * Math.atan2(C.body.rotation().y, C.body.rotation().w)).toFixed(2), pl: [+P.position.x.toFixed(2), +P.position.z.toFixed(2)], yaw: +P.yaw.toFixed(2), wp: [wp.x, wp.z], idx, held: G.grab.held === C.rec, lag: +lagNow().toFixed(2), dist: +G.grab.dist.toFixed(2), go: lastGo });
      const np = C.body.translation(), dg = Math.hypot(np.x - goal.x, np.z - goal.z);
      if (dg < 1.6) { arrived = true; break; }
      if (idx > best || best === 1e9) { best = idx; sinceBest = 0; } else sinceBest += 0.1;   // progress along the route (a detour moves away from the goal)
      hist.push({ x: np.x, z: np.z }); if (hist.length > 11) hist.shift(); phist.push({ x: P.position.x, z: P.position.z }); if (phist.length > 11) phist.shift();   // stall: the cart's net move over the last 1 s under 15 cm (jiggling in a corner counts)
      const h0 = hist[0], net = hist.length >= 11 ? Math.hypot(np.x - h0.x, np.z - h0.z) : 1; if (net < 0.15) still = 1; else if (net > 0.6) { still = 0; stallOpen = false; }
      if (still >= 1 && !stallOpen) { stallOpen = true; res.stalls++;
        // why: the cart's contacts with a side-on normal (|n.y| < 0.7) name the thing; none and the pusher stuck = the pusher
        const cx = np.x, cz = np.z, kinds = new Set(), W2 = G.phys.world;
        for (const cc of C.cols) W2.contactPairsWith(cc, (o) => { W2.contactPair(cc, o, (m) => { let md = 1; for (let i = 0; i < m.numContacts(); i++) md = Math.min(md, m.contactDist(i)); if (md > 0.02) return; const n = m.normal(); const k = what(o), side = Math.abs(n.y) < 0.7;
          if (k === 'door') kinds.add('cánh cửa'); else if (k === 'stair') kinds.add(side ? 'mép cầu thang' : 'trên dốc'); else if (k.startsWith('prop:')) kinds.add('decor ' + k.slice(5)); else if (k === 'loot') kinds.add('loot trên sàn');
          else if (k === 'kinematic' && o.parent() === P.body) kinds.add('người chơi chạm xe'); else if (k === 'wall/floor' && side) kinds.add(G.house.doorRecs.some((d) => Math.hypot(d.cx - cx, d.cz - cz) < 1.6) ? 'khung cửa' : 'tường'); }); });
        const ph0 = phist[0], pStuck = ph0 && Math.hypot(P.position.x - ph0.x, P.position.z - ph0.z) < 0.15 && lastGo;
        const order = ['cánh cửa', 'khung cửa', 'mép cầu thang', 'loot trên sàn', 'tường', 'người chơi chạm xe'];
        let k2 = order.find((k) => kinds.has(k)) || [...kinds].find((k) => k.startsWith('decor')) || (pStuck ? 'người chơi vướng' : kinds.has('trên dốc') ? 'trên dốc, không chạm gì khác' : 'không chạm gì');
        const kd = k2.startsWith('decor') ? 'decor' : k2;
        if (res.at.length < 40) res.at.push({ at: [+cx.toFixed(1), +cz.toFixed(1)], k: k2, route: res.routes });
        res.byKind[kd] = (res.byKind[kd] || 0) + 1;
        res.blockers[k2] = (res.blockers[k2] || 0) + 1; if (${SHOT}) { const cts = []; for (const cc of C.cols) G.phys.world.contactPairsWith(cc, (o) => { G.phys.world.contactPair(cc, o, (m, fl) => { if (m.numContacts() > 0) { const n = m.normal(); cts.push({ me: C.cols.indexOf(cc), other: what(o), n: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)], fl, d: +m.contactDist(0).toFixed(3) }); } }); }); const all = []; for (const cc of C.cols) G.phys.world.contactPairsWith(cc, (o) => { G.phys.world.contactPair(cc, o, (m) => { for (let i = 0; i < m.numContacts(); i++) all.push([C.cols.indexOf(cc), what(o), +m.contactDist(i).toFixed(3)]); }); }); res.shot = { cart: { ...np }, pl: { ...P.position }, k: k2, route: res.routes, contacts: cts, all, v: C.body.linvel(), w: C.body.angvel(), strain: +G.grab.strain.toFixed(2), push: C.rec.pushErr, slides: C.slides, hops: C.hops, log: C.log.slice(-5), rot: C.body.rotation() };
          { const g = [], cxI = Math.floor(np.x), czI = Math.floor(np.z), hc = G.house.heightAt(np.x, np.z), onPath = new Set(path.map((q) => Math.floor(q.z) * W + Math.floor(q.x)));   // a 15 x 15 cell map round the stall
            for (let y = czI - 7; y <= czI + 7; y++) { let row = ''; for (let x = cxI - 7; x <= cxI + 7; x++) { const i = y * W + x, h = G.house.heightAt(x + 0.5, y + 0.5);
              let c = !nav.ok(x, y) ? '#' : solid(x, y) ? 'p' : G.house.doorRecs.some((d) => Math.floor(d.cx) === x && Math.floor(d.cz) === y) ? 'D' : Math.abs(h - Math.round(h)) > 0.05 ? 's' : onPath.has(i) ? '*' : h > hc + 0.05 ? '^' : h < hc - 0.05 ? 'v' : '.';
              if (x === cxI && y === czI) c = 'C'; if (x === Math.floor(P.position.x) && y === Math.floor(P.position.z)) c = 'P'; if (Math.floor(goal.x) === x && Math.floor(goal.z) === y) c = 'G'; row += c; } g.push(row); }
            res.shot.map = g; res.shot.cell = [cxI, czI];
            const pt = new Set(), cap = P.col.shape; G.phys.world.intersectionsWithShape(P.body.translation(), P.body.rotation(), new G.phys.R.Capsule(cap.halfHeight, cap.radius + 0.06), (col) => { if (col.parent() !== P.body) pt.add(what(col) + (col.parent() === C.body ? ':cart' : '')); return true; }, G.phys.R.QueryFilterFlags.EXCLUDE_SENSORS);
            res.shot.playerTouches = [...pt]; res.shot.pStep = lastGo; }
          return res; } }
      if (sinceBest > 6) { res.failed.push({ tg: tg.kind, why: 'no progress 6 s', at: [+np.x.toFixed(1), +np.z.toFixed(1)] }); break; }
    }
    if (arrived) res.arrived++;
    if (G.grab.held) G.grab.release(false);
  }
  res.solidN = [...solidC.values()].filter(Boolean).length; res.solidAll = solidC.size; return res; })()`;

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 3000 s'); process.exit(2); }, 3000000);
  const tot = { houses: 0, routes: 0, arrived: 0, stalls: 0, snaps: 0, failed: 0, blockers: {}, simS: 0 }, spots = [];
  const t0 = Date.now();
  try {
    for (const theme of THEMES) for (const hi of HOUSES) for (const seed of SEEDS) {
      const ctx = await br.newContext({ viewport: { width: 480, height: 270 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
      const page = await ctx.newPage(); const logs = []; page.on('pageerror', (e) => logs.push(e.message));
      await page.goto(srv.base + `/games/repo3d/index.html?house=${hi}&seed=${seed}&foes=none&bots=0&traps=0&passives=0&theme=${theme}`);
      await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
      let r; try { r = await page.evaluate(DRIVE); } catch (e) { r = { routes: 0, arrived: 0, stalls: 0, snaps: 0, failed: [{ why: 'error ' + e.message.slice(0, 120) }], blockers: {}, simS: 0 }; }
      if (r.shot) { const base = require('./pw.js').scratch('cartshot') + `/${theme}-h${hi}-s${seed}`; require('fs').mkdirSync(require('path').dirname(base), { recursive: true });
        await page.screenshot({ path: base + '-eye.jpg', type: 'jpeg', quality: 80 });
        await page.evaluate(`(() => { const G = __G, c = ${JSON.stringify(r.shot.cart)}; const cam = G.camera; G.viewOn = false; cam.position.set(c.x, c.y + 4.5, c.z + 0.01); cam.lookAt(c.x, c.y, c.z); G.player.updateCamera = () => {}; G.house.update?.(cam.position); __sim(0.0001); cam.position.set(c.x, c.y + 4.5, c.z + 0.01); cam.lookAt(c.x, c.y, c.z); G.renderer?.render?.(G.scene, cam); })()`);
        await page.screenshot({ path: base + '-top.jpg', type: 'jpeg', quality: 80 }); const mp = r.shot.map; delete r.shot.map; console.log('shot ' + base + ' ' + JSON.stringify(r.shot)); if (mp) console.log(mp.join('\n')); }
      tot.houses++; for (const k of ['routes', 'arrived', 'stalls', 'snaps', 'simS']) tot[k] += r[k]; tot.backoffs = (tot.backoffs || 0) + (r.backoffs || 0); tot.skipped = (tot.skipped || 0) + (r.skipped || []).length; tot.failed += r.failed.length; for (const [k, v] of Object.entries(r.byKind || {})) tot.blockers[k] = (tot.blockers[k] || 0) + v; for (const a of r.at || []) spots.push({ house: `${theme}-h${hi}-s${seed}`, ...a });
      if (r.trace) { console.log('path ' + JSON.stringify(r.path0)); for (const q of r.trace) console.log(JSON.stringify(q)); }
      console.log(`${theme}-h${hi}-s${seed}: routes ${r.routes}, arrived ${r.arrived}, stalls ${r.stalls}, snaps ${r.snaps}, failed ${JSON.stringify(r.failed).slice(0, 200)}, causes ${JSON.stringify(r.byKind)}, snap why ${JSON.stringify(r.snapWhy)} ${JSON.stringify(r.snapAt || [])}, solid ${r.solidN}/${r.solidAll}, stall spots ${JSON.stringify(r.at).slice(0, 300)}${logs.length ? ' ERR ' + logs[0] : ''}`);
      await ctx.close();
    }
  } catch (e) { console.log('FAIL run ' + e.message.slice(0, 300)); }
  clearTimeout(kill); await br.close(); srv.close();
  const top = Object.entries(tot.blockers).sort((a, b) => b[1] - a[1]);
  require('fs').writeFileSync(require('./pw.js').scratch('cartdrive') + '-spots.json', JSON.stringify(spots, null, 1)); console.log('stall spots: ' + require('./pw.js').scratch('cartdrive') + '-spots.json');
  console.log(`\nTOTAL houses ${tot.houses}: routes ${tot.routes}, arrived ${tot.arrived}, stalls ${tot.stalls}, back-offs ${tot.backoffs}, beam snaps ${tot.snaps}, failed routes ${tot.failed}, loot rooms without a cart cell ${tot.skipped || 0}, sim ${tot.simS.toFixed(0)} s in ${((Date.now() - t0) / 1000).toFixed(0)} s; stalls by cause ${JSON.stringify(top)}`);
  process.exit(tot.stalls || tot.failed || tot.snaps ? 1 : 0);
})();
