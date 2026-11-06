// Web-only objective modes [ĐỀ XUẤT] (owner request 2026-11-02): rules borrowed from SquadBlast's Payload and from an
// attack / defend siege, built on Food Gang's own maps, fighters and art. Nothing here runs for the four original goals
// (DeathMatch, Kill5, LastSurvivor, KillBoss): their state keeps exactly the C# fields and their RNG use is untouched.
//
// PUSH THE CART (GoalType.Payload, 2v2): one cart starts mid-map on a path along each map's floor. A team with fighters
// next to it and no enemy next to it pushes it toward the enemy side (team 1 -> +x, team 2 -> -x); contested or alone
// it stays. Reaching the enemy end wins; at time-out the team that pushed it past the middle wins, else a draw.
// DEFEND THE FRIDGE (GoalType.Siege, 2v2): the defending team (the bossOnLeft side, drawn by matchmaking) owns a fridge
// at its end of the map. Attackers' bullets, explosions and melee hits damage it; defenders cannot. The fridge breaking
// wins for the attackers; the defenders win when the timer runs out.
import { f, Vec2 } from '../Core/Vec2.js';
import { GoalType, GamePhase, StatusFlags } from '../Data/Enums.js';

export const OBJECTIVE_EVENT = Object.freeze({ ObjectiveHit: 17, CartMoved: 18 });   // outside SIM_EVENT_TYPE_COUNT (C# set)
export const HOUSE_ID = 7;              // a non-agent id in bullet.hitAgent / agent.meleeHit
export const PUSH_RADIUS = f(2.5);
export const CART_SPEED = [0, f(1.6), f(2.1)];   // units per second for 1 / 2 pushers
export const HOUSE_HP = 6500;
export const GOAL_AT = 0.75;
export const HOUSE_HALF = Object.freeze({ x: f(1.3), y: f(1.6) });

// cart path per map (floor top, through the middle obstacles), x from team 1's end to team 2's end
const PATHS = [
  [[-20, 0], [20, 0]],                                                                   // Kitchen
  [[-19, 0], [-2.4, 0], [-1.8, 1.4], [1.8, 1.4], [2.4, 0], [19, 0]],                      // Dining table (plates)
  [[-17, 0], [-12.6, 0], [-12.6, -3], [-4.2, -3], [-4.2, 0], [4.2, 0], [4.2, -3], [12.6, -3], [12.6, 0], [17, 0]], // Pantry
];
// fridge x on each map's left end (mirrored for the right), standing on the floor at y
const HOUSES = [{ x: 21.5, y: 0 }, { x: 20, y: 0 }, { x: 19, y: 0 }];

export const isObjective = (g) => g === GoalType.Payload || g === GoalType.Siege;
export const defenderTeam = (s) => (s.bossOnLeft ? 1 : 2);

function pathOf(mapIndex) {
  const pts = PATHS[mapIndex] || PATHS[0];
  const seg = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = f(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    seg.push(l); len = f(len + l);
  }
  // the finish line sits GOAL_AT of the way to each end, in front of the spawns
  return { pts, seg, len, half: f(len / 2), goal: f(f(len / 2) * GOAL_AT) };
}
const PATH_CACHE = new Map();
export function cartPath(mapIndex) {
  if (!PATH_CACHE.has(mapIndex)) PATH_CACHE.set(mapIndex, pathOf(mapIndex));
  return PATH_CACHE.get(mapIndex);
}

/** Cart position for t in [-half, half] (0 = middle of the path). */
export function cartPos(mapIndex, t) {
  const P = cartPath(mapIndex);
  let d = f(t + P.half);
  for (let i = 0; i < P.seg.length; i++) {
    if (d <= P.seg[i] || i === P.seg.length - 1) {
      const k = P.seg[i] > 0 ? Math.min(1, Math.max(0, d / P.seg[i])) : 0;
      const a = P.pts[i], b = P.pts[i + 1];
      return { x: f(a[0] + (b[0] - a[0]) * k), y: f(a[1] + (b[1] - a[1]) * k) };
    }
    d = f(d - P.seg[i]);
  }
  const e = P.pts[P.pts.length - 1];
  return { x: e[0], y: e[1] };
}

/** Fridge rectangle {cx, cy, hx, hy} of the defending side. */
export function houseRect(s) {
  const h = HOUSES[s.mapIndex] || HOUSES[0];
  const x = defenderTeam(s) === 1 ? -h.x : h.x;
  return { cx: f(x), cy: f(h.y + HOUSE_HALF.y), hx: HOUSE_HALF.x, hy: HOUSE_HALF.y };
}

/** Match.create: objective fields exist only in objective matches (C# state for the original goals stays as is). */
export function init(s) {
  if (s.goal === GoalType.Payload) { s.cartT = 0; s.cartPush = 0; }
  else if (s.goal === GoalType.Siege) { s.objHp = HOUSE_HP; s.objHpMax = HOUSE_HP; }
}

const alive = (a) => (a.flags & (StatusFlags.Dead | StatusFlags.RespawnWait)) === 0;

/** Per tick (Match.step, after the bullets): cart movement and the payload win. */
export function update(c, triggerGameOver) {
  const s = c.s;
  if (s.goal !== GoalType.Payload || s.phase !== GamePhase.Playing) return;
  const p = cartPos(s.mapIndex, s.cartT);
  let n1 = 0, n2 = 0;
  for (const a of s.agents) {
    if (!alive(a) || a.isDummy) continue;
    if (Math.abs(f(a.pos.x - p.x)) > PUSH_RADIUS || Math.abs(f(a.pos.y - p.y)) > f(PUSH_RADIUS + 1)) continue;
    if (a.team === 1) n1++; else if (a.team === 2) n2++;
  }
  const push = n1 > 0 && n2 === 0 ? 1 : n2 > 0 && n1 === 0 ? 2 : n1 > 0 ? 3 : 0;
  if (push !== s.cartPush) { s.cartPush = push; c.emit(OBJECTIVE_EVENT.CartMoved, { i: push, pos: p }); }
  if (push === 1 || push === 2) {
    const P = cartPath(s.mapIndex);
    const v = CART_SPEED[Math.min(2, push === 1 ? n1 : n2)];
    const t = f(s.cartT + f((push === 1 ? 1 : -1) * f(v * c.dt)));
    s.cartT = Math.max(f(-P.half), Math.min(P.half, t));
    if (s.cartT >= P.goal) triggerGameOver(c, 1, -1, false);
    else if (s.cartT <= -P.goal) triggerGameOver(c, 2, -1, false);
  }
}

/** Time-out winner of an objective goal (GameRules.resolveTimerWinner). */
export function timeOutWinner(s) {
  if (s.goal === GoalType.Siege) return defenderTeam(s);
  return s.cartT > 0.05 ? 1 : s.cartT < -0.05 ? 2 : 0;
}

/** Damage to the fridge from agent `srcId` (bullet, explosion or melee). Returns true when it counted. */
export function damageHouse(c, srcId, amount, pos, triggerGameOver) {
  const s = c.s;
  if (s.goal !== GoalType.Siege || s.phase !== GamePhase.Playing || !(amount > 0)) return false;
  const src = c.agent(srcId);
  if (src == null || src.team === defenderTeam(s)) return false;
  s.objHp = Math.max(0, f(s.objHp - amount));
  c.emit(OBJECTIVE_EVENT.ObjectiveHit, { agent: srcId, value: amount, pos });
  if (s.objHp <= 0) triggerGameOver(c, src.team, -1, false);
  return true;
}

/** Point-in-fridge test inflated by r (bullets). */
export function inHouse(s, p, r = 0) {
  const h = houseRect(s);
  return Math.abs(f(p.x - h.cx)) <= f(h.hx + r) && Math.abs(f(p.y - h.cy)) <= f(h.hy + r);
}

/** Distance from p to the fridge rectangle (0 inside). */
export function houseDistance(s, p) {
  const h = houseRect(s);
  const dx = Math.max(0, Math.abs(f(p.x - h.cx)) - h.hx), dy = Math.max(0, Math.abs(f(p.y - h.cy)) - h.hy);
  return f(Math.hypot(dx, dy));
}

/**
 * Bot objective (BotBrain.evaluateMove, objective goals only): where to go when no enemy is close, and whether to
 * strike the fridge. Returns {dest, attack} or null (fight as usual).
 */
export function botObjective(c, a, enemyNear) {
  const s = c.s;
  if (s.goal === GoalType.Payload) {
    if (enemyNear) return null;
    return { dest: cartPos(s.mapIndex, s.cartT), attack: false };
  }
  if (s.goal === GoalType.Siege) {
    const h = houseRect(s);
    if (a.team === defenderTeam(s)) {
      if (enemyNear) return null;
      // guard just in front of the fridge
      const front = h.cx < 0 ? f(h.cx + 3) : f(h.cx - 3);
      return { dest: { x: front, y: f(h.cy - h.hy) }, attack: false };
    }
    const side = a.pos.x < h.cx ? -1 : 1;
    const stand = { x: f(h.cx + side * f(h.hx + 1)), y: f(h.cy - h.hy) };
    const close = houseDistance(s, Vec2.add(a.pos, { x: 0, y: 1 })) < 2.2;
    if (enemyNear && !close) return null;
    return { dest: stand, attack: close, face: h.cx < a.pos.x ? -1 : 1 };
  }
  return null;
}
