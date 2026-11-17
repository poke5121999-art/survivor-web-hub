// NavMeshAgent stand-in for rivals and animals: follow a nav path to a destination at the speed the script sets.
// Simplification: no acceleration/avoidance (agent acceleration 8 and radius 0.5 are not modelled). A destination the
// rules cannot reach (closed player gate, gates.js) is reported as an invalid path, like NavMeshPathStatus.PathInvalid.
import { d2xz, dxz, yawTo } from './util.js';
import { fenceRoute } from './fences.js';

const REPATH_MOVE2 = 0.25;   // re-plan when the destination moved more than 0.5 m (keeps chases cheap)

export function agentTo(sim, ag, dest, speed, dt, stop = 0) {
  let nav = ag.nav;
  if (!nav || !nav.dest || d2xz(nav.dest, dest) > REPATH_MOVE2 || (nav.pts && !nav.pts.length && dxz(ag.pos, dest) > stop + 0.05)) {
    const blocked = sim.pathBlocked(ag.pos, dest);
    const pts = blocked ? null : route(sim, ag.pos, dest);
    nav = ag.nav = { dest: [dest[0], dest[1], dest[2]], pts: pts || [], invalid: !pts };
  }
  // The closed player gate carves the navmesh: re-test every frame, re-plan once it opens again.
  const blocked = sim.pathBlocked(ag.pos, dest);
  if (blocked) nav.invalid = true;
  else if (nav.invalid) {
    const pts = route(sim, ag.pos, dest);
    nav = ag.nav = { dest: [dest[0], dest[1], dest[2]], pts: pts || [], invalid: !pts };
  }
  ag.moving = false;
  if (nav.invalid) return { remaining: dxz(ag.pos, dest), invalid: true };
  let remaining = pathLength(ag.pos, nav.pts);
  let budget = speed * dt;
  while (budget > 0 && nav.pts.length && remaining > stop) {
    const tgt = nav.pts[0], d = dxz(ag.pos, tgt);
    const can = Math.min(budget, d, remaining - stop);
    if (d > 1e-6) {
      ag.yaw = yawTo(ag.pos, tgt);
      const k = can / d;
      ag.pos[0] += (tgt[0] - ag.pos[0]) * k;
      ag.pos[1] += (tgt[1] - ag.pos[1]) * k;
      ag.pos[2] += (tgt[2] - ag.pos[2]) * k;
      ag.moving = can > 1e-6;
    }
    budget -= can;
    remaining -= can;
    if (dxz(ag.pos, tgt) < 1e-4) nav.pts.shift();
    if (can <= 1e-9) break;
  }
  return { remaining: Math.max(0, remaining), invalid: false };
}

// Nav path along the fence-aware waypoints (fences.js); null when no route exists.
export function route(sim, from, to) {
  const legs = fenceRoute(sim, from, to);
  if (!legs) return null;
  let at = from;
  const pts = [];
  for (const p of legs) {
    const leg = sim.nav.path(at, p);
    if (!leg) return null;
    pts.push(...leg);
    at = p;
  }
  return pts;
}

export function agentStop(ag) {
  ag.nav = null;
  ag.moving = false;
}

function pathLength(p, pts) {
  let s = 0, a = p;
  for (const b of pts) { s += dxz(a, b); a = b; }
  return s;
}

export function face(ag, target) {
  if (d2xz(ag.pos, target) > 0.001) ag.yaw = yawTo(ag.pos, target);
}
