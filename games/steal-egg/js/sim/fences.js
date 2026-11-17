// Agent routes around the four fenced farms. Every farm is fenced by MyFirstFence NavMeshObstacles (carve, so they are
// cut into the navmesh at runtime and absent from the baked navmesh.json) with one opening: its gate. An agent that
// enters or leaves a farm passes the gate opening; one that only passes by goes around the fence corners.
// The closed player gate also carves (gates.md 1.1): no route into or out of the player farm then (null = invalid).
import { insideBy } from './util.js';

const CORNER = 0.8;   // corner nodes this far outside the fence (agent radius 0.5 + clearance)
const GATE_STEP = 1.0; // gate waypoints this far inside / outside the opening

const guardBox = (sim, f) => (f === 0 ? sim.D.farm.zone : sim.D.rivalFarms[f - 1].area);
const gatePos = (sim, f) => (f === 0 ? sim.D.gates.player.pos : sim.D.gates.ai[f - 1].pos);
const agentR = sim => sim.D.rivals[0].agentRadius;

export function farmOf(sim, p) {
  for (let f = 0; f < sim.state.farms.length; f++) if (insideBy(guardBox(sim, f), p, agentR(sim))) return f;
  return null;
}

function horizontalAxes(box) {
  const out = [];
  for (let i = 0; i < 3; i++) if (Math.abs(box.ax[i][1]) <= 0.7) out.push({ u: [box.ax[i][0], box.ax[i][2]], h: box.h[i] });
  return out;
}

// Points just inside and outside the gate opening of farm f.
function gateDoor(sim, f) {
  const box = guardBox(sim, f), g = gatePos(sim, f);
  let best = null;
  for (const { u, h } of horizontalAxes(box)) {
    const proj = (g[0] - box.c[0]) * u[0] + (g[2] - box.c[2]) * u[1];
    const k = Math.abs(proj) / h;
    if (!best || k > best.k) best = { k, n: [u[0] * Math.sign(proj), u[1] * Math.sign(proj)] };
  }
  const n = best.n;
  return { inner: [g[0] - n[0] * GATE_STEP, g[1], g[2] - n[1] * GATE_STEP], outer: [g[0] + n[0] * GATE_STEP, g[1], g[2] + n[1] * GATE_STEP] };
}

// Does segment a-b cross the box grown by r (2D slab clipping)?
function segHitsBox(box, a, b, r) {
  let t0 = 0, t1 = 1;
  for (const { u, h } of horizontalAxes(box)) {
    const pa = (a[0] - box.c[0]) * u[0] + (a[2] - box.c[2]) * u[1];
    const pb = (b[0] - box.c[0]) * u[0] + (b[2] - box.c[2]) * u[1];
    const d = pb - pa, lim = h + r;
    if (Math.abs(d) < 1e-9) { if (Math.abs(pa) > lim) return false; continue; }
    let e0 = (-lim - pa) / d, e1 = (lim - pa) / d;
    if (e0 > e1) [e0, e1] = [e1, e0];
    t0 = Math.max(t0, e0); t1 = Math.min(t1, e1);
    if (t0 > t1) return false;
  }
  return true;
}

function corners(sim, f) {
  const box = guardBox(sim, f), [A, B] = horizontalAxes(box), out = [];
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const ka = (A.h + CORNER) * sa, kb = (B.h + CORNER) * sb;
    out.push([box.c[0] + A.u[0] * ka + B.u[0] * kb, box.c[1], box.c[2] + A.u[1] * ka + B.u[1] * kb]);
  }
  return out;
}

// Shortest outside route a -> b around every farm footprint, through fence-corner nodes (visibility graph).
function around(sim, a, b, skip) {
  const r = agentR(sim), farms = sim.state.farms.map((x, f) => f).filter(f => f !== skip);
  // A fence the agent already leans on (endpoint within r of the footprint) does not block that segment.
  const near = (f, p) => insideBy(guardBox(sim, f), p, -r);
  const clear = (p, q) => farms.every(f => near(f, p) || near(f, q) || !segHitsBox(guardBox(sim, f), p, q, r));
  if (clear(a, b)) return [b];
  const nodes = [a, b];
  farms.forEach(f => nodes.push(...corners(sim, f)));
  const n = nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let i = -1;
    for (let k = 0; k < n; k++) if (!done[k] && dist[k] < Infinity && (i < 0 || dist[k] < dist[i])) i = k;
    if (i < 0 || i === 1) break;
    done[i] = true;
    for (let k = 0; k < n; k++) {
      if (done[k] || k === i) continue;
      const d = dist[i] + Math.hypot(nodes[k][0] - nodes[i][0], nodes[k][2] - nodes[i][2]);
      if (d < dist[k] && clear(nodes[i], nodes[k])) { dist[k] = d; prev[k] = i; }
    }
  }
  if (prev[1] < 0) return [b];  // boxed in: let the navmesh decide
  const out = [];
  for (let k = 1; k > 0; k = prev[k]) out.unshift(nodes[k]);
  return out;
}

// Waypoints (ending at `to`) for an agent; null when the closed player gate stands in the way.
export function fenceRoute(sim, from, to) {
  const fa = farmOf(sim, from), fb = farmOf(sim, to);
  if (fa === fb) return fa == null ? around(sim, from, to, null) : [to];
  const gateShut = f => f === 0 && !sim.state.farms[0].gate.open;
  if ((fa != null && gateShut(fa)) || (fb != null && gateShut(fb))) return null;
  const pts = [];
  let cur = from;
  if (fa != null) { const d = gateDoor(sim, fa); pts.push(d.inner, d.outer); cur = d.outer; }
  if (fb != null) {
    const d = gateDoor(sim, fb);
    pts.push(...around(sim, cur, d.outer, null), d.inner, to);
  } else pts.push(...around(sim, cur, to, null));
  return pts;
}
