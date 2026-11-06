// Bot navigation over MapNavDataAsset nodes (spec Part 6 §9).
import { f, FLOAT_MAX, Vec2 } from '../Core/Vec2.js';
import { NavNodeType } from '../Data/Enums.js';

const MAX_NAV_NODES = 256;
const MAX_HOPS = 47;
const MAX_STORED = 12;
const F05 = 0.5;

export function nearestGroundNode(nodes, pos) {
  let best = -1;
  let bd = FLOAT_MAX;
  for (let pass = 0; pass < 2 && best < 0; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type !== NavNodeType.Walkable || f(n.pos.y - 1) > pos.y) continue;
      if (pass === 0 && Math.abs(f(n.pos.x - pos.x)) > 1) continue;
      const d = Vec2.distance(n.pos, pos);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

export function nearestNode(nodes, pos) {
  let best = -1;
  let bd = FLOAT_MAX;
  for (let pass = 0; pass < 2 && best < 0; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type !== NavNodeType.Walkable) continue;
      if (pass === 0 && (n.pos.y > f(pos.y + 3) || Math.abs(f(n.pos.x - pos.x)) > 3 || f(pos.y - n.pos.y) >= 6)) continue;
      const d = Vec2.distance(n.pos, pos);
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

export function bestJumpNodeToward(nodes, from, to) {
  let best = -1;
  let bd = FLOAT_MAX;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type !== NavNodeType.Jump || n.pos.y > f(from.y + 5)) continue;
    const d = Math.abs(f(n.pos.x - to.x));
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const stepCost = (t) => (t === NavNodeType.Jump ? 10 : t === NavNodeType.Walkable ? 2 : 1);

/** Scratch buffers of one Match (C# NavGraph instance per Ctx). */
export class NavGraph {
  constructor() {
    this._dist = new Float32Array(MAX_NAV_NODES);
    this._f = new Float32Array(MAX_NAV_NODES);
    this._parent = new Int32Array(MAX_NAV_NODES);
    this._open = new Uint8Array(MAX_NAV_NODES);
    this._closed = new Uint8Array(MAX_NAV_NODES);
    this._route = [];
  }

  /** AgentAISystem.RequestPath: keeps the old path when no route exists. */
  requestPath(nodes, bot, from, to) {
    const n = nodes.length;
    if (n === 0 || n > MAX_NAV_NODES) return;
    const s = nearestGroundNode(nodes, from), g = nearestNode(nodes, to);
    if (s < 0 || g < 0) return;
    const dist = this._dist, fs = this._f, parent = this._parent, open = this._open, closed = this._closed;
    for (let i = 0; i < n; i++) { dist[i] = FLOAT_MAX; fs[i] = FLOAT_MAX; parent[i] = -1; open[i] = 0; closed[i] = 0; }
    dist[s] = 0;
    fs[s] = Vec2.distance(nodes[s].pos, nodes[g].pos);
    open[s] = 1;
    for (let iter = 0; iter < 2 * n; iter++) {
      let u = -1;
      let uf = FLOAT_MAX;
      for (let i = 0; i < n; i++) if (open[i] && fs[i] < uf) { uf = fs[i]; u = i; }
      if (u < 0 || u === g) break;
      open[u] = 0;
      closed[u] = 1;
      for (const nb of nodes[u].neighbors) {
        if (nb < 0 || nb >= n || closed[nb]) continue;
        const ng = f(dist[u] + stepCost(nodes[nb].type));
        if (ng < dist[nb]) {
          parent[nb] = u;
          dist[nb] = ng;
          fs[nb] = f(f(ng + Vec2.distance(nodes[nb].pos, nodes[g].pos)) + (nodes[nb].type === NavNodeType.Jump ? nodes[nb].realHeight : 0));
          open[nb] = 1;
        }
      }
    }
    if (parent[g] < 0 && s !== g) return;

    const route = this._route;
    route.length = 0;
    for (let cur = g, hops = 0; cur >= 0 && hops <= MAX_HOPS; cur = parent[cur], hops++) {
      route.push(cur);
      if (cur === s) break;
    }
    route.reverse();

    let count = 0;
    for (let i = 0; i < route.length && count < MAX_STORED; i++) {
      const id = route[i];
      const isGoal = i === route.length - 1;
      const keep = isGoal || nodes[id].type !== NavNodeType.Walkable
        || (i + 1 < route.length && nodes[route[i + 1]].type !== NavNodeType.Walkable);
      if (keep) bot.navPath[count++] = id;
    }
    bot.navCount = count;
    bot.navIndex = 0;
    if (count > 1 && nodes[bot.navPath[0]].type === NavNodeType.Walkable && Vec2.distance(from, nodes[bot.navPath[0]].pos) < F05)
      bot.navIndex = 1;
  }
}
