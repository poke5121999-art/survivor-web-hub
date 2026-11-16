// Camera rig: decides where the view looks and which way it is turned. Pure (runs in Node).
// main.js feeds it the match, the visible ground size and the aim signal, then turns focus + yaw into the three.js camera.
import { weaponRange, visibleTo } from './sim.js';

export const HEIGHTS = [
  { key: 'near', name: 'Gần', zoom: 0.86 },
  { key: 'mid', name: 'Vừa', zoom: 1 },
  { key: 'far', name: 'Xa', zoom: 1.2 },
];
export const zoomOf = (key) => (HEIGHTS.find((h) => h.key === key) || HEIGHTS[1]).zoom;

// Modes where each team owns one end of the map. Team 1 sees them turned half round, so both teams have their own side on the left and attack the same way.
const SIDED = { tdm: true, chiem: true, nha: true };
export const flipFor = (m, u) => !!(m && u && SIDED[m.mode] && u.team === 1);

export const CAM_RULES = {
  dead: 0.35,                    // m the tank may move before the view follows
  tau: 0.1,                      // s, time constant of the follow
  vmax: 36,                      // m/s, top speed of the focus while it follows
  leadAim: 2, leadVel: 0.14, leadMax: 3.2, leadTau: 0.3,
  bias: 1.2,                     // m toward the bottom of the screen: the tank sits a little above centre, clear of the skill buttons
  longAim: 16,                   // m: an aim that reaches farther pans the view (about half the visible width)
  slowFire: 0.9,                 // s: a main weapon that fires faster never pans
  panFrom: 8, panGain: 0.5, panTau: 0.2, panBack: 0.28,
  inner: [0.62, 0.72, 0.4],      // share of the half width, the far depth and the near depth that the tank and a locked target stay inside (the near share is small: the skill buttons sit there)
  killer: 1.5,                   // s the view stays on whoever took the player down
  edge: [9, 5, 2],               // m kept between the focus and the map edge: sides, far edge, near edge
};
// Seconds the view takes to glide onto the subject of each mode.
const EASE = { follow: 0.35, killer: 0.45, ally: 0.6, wreck: 0.3, free: 0.18 };

// What the player is aiming far with right now: { a, reach } or null.
// st = { hint: touch.js's skill drag or null, fire: the main weapon is aimed by hand and held, aim }.
export function longAim(u, st) {
  const R = CAM_RULES;
  if (!u || !u.alive) return null;
  const h = st && st.hint;
  if (h && !h.cancel && h.range > R.longAim) return { a: Math.atan2(h.tz - h.z, h.tx - h.x), reach: Math.hypot(h.tx - h.x, h.tz - h.z) };
  const c = u.cast;
  if (c && c.skill.range > R.longAim) return { a: c.aim, reach: c.skill.range };
  const w = u.def.weapon, far = weaponRange(u);
  if (st && st.fire && far > R.longAim && (w.charge || w.cd >= R.slowFire)) return { a: st.aim, reach: far };
  return null;
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export function createRig() {
  const R = CAM_RULES;
  const s = { mode: 'follow', target: -1, x: 0, z: 0, fx: 0, fz: 0, ax: 0, az: 0, lx: 0, lz: 0, ox: 0, oz: 0, from: null, deadT: 0, killer: -1, free: null, speed: 0, sign: 1, yaw: 0 };

  function reset(m, meId) {
    const u = m.units[meId];
    s.sign = flipFor(m, u) ? -1 : 1; s.yaw = s.sign < 0 ? Math.PI : 0;
    s.mode = 'follow'; s.target = meId; s.from = null; s.free = null; s.deadT = 0; s.killer = -1; s.speed = 0;
    s.ax = u.x; s.az = u.z; s.lx = s.lz = s.ox = s.oz = 0;
    s.fx = s.x = u.x; s.fz = s.z = u.z + R.bias * s.sign;
  }

  function event(e, meId) { if (e.t === 'death' && e.id === meId) s.killer = e.by ?? -1; }

  // Which mode the match calls for, and whom it looks at.
  function want(m, me) {
    if (s.free) return ['free', -1];
    if (me.alive) return ['follow', me.id];
    const k = m.units[s.killer], seen = k && k.alive && k.id !== me.id && visibleTo(m, k, me.team);
    if (seen && s.deadT < R.killer) return ['killer', k.id];
    const cur = s.mode === 'ally' ? m.units[s.target] : null;
    if (cur && cur.alive) return ['ally', cur.id];
    let best = null, bd = Infinity;
    for (const u of m.units) {
      if (!u.alive || u.id === me.id || u.team !== me.team) continue;
      const d = Math.hypot(u.x - s.x, u.z - s.z);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) return ['ally', best.id];
    return seen ? ['killer', k.id] : ['wreck', me.id];
  }

  // view = { hw, far, near }: visible ground half width and depth away from / toward the camera, in metres at the focus.
  // sig = longAim() or null. lock = the auto-aim target { x, z } or null.
  function update(dt, m, meId, view, sig, lock) {
    const me = m.units[meId], sg = s.sign;
    s.deadT = me.alive ? 0 : s.deadT + dt;
    const [mode, target] = want(m, me);
    const moved = mode !== s.mode || target !== s.target;
    if (moved) { s.from = { x: s.x, z: s.z, t: 0, T: EASE[mode] }; s.mode = mode; s.target = target; }
    const sub = mode === 'free' ? s.free : m.units[target];

    if (moved) { s.ax = sub.x; s.az = sub.z; }
    const dx = sub.x - s.ax, dz = sub.z - s.az, d = Math.hypot(dx, dz);
    if (mode === 'free') { s.ax = sub.x; s.az = sub.z; }
    else if (d > R.dead) { s.ax += dx / d * (d - R.dead); s.az += dz / d * (d - R.dead); }

    const own = mode === 'follow';
    let lx = 0, lz = 0;
    if (own) {
      lx = Math.cos(me.aim) * R.leadAim + me.vx * R.leadVel; lz = Math.sin(me.aim) * R.leadAim + me.vz * R.leadVel;
      const l = Math.hypot(lx, lz);
      if (l > R.leadMax) { lx *= R.leadMax / l; lz *= R.leadMax / l; }
    }
    const kl = moved ? 1 : ease(dt, R.leadTau);
    s.lx += (lx - s.lx) * kl; s.lz += (lz - s.lz) * kl;

    const bx = s.ax + s.lx, bz = s.az + s.lz + (mode === 'free' ? 0 : R.bias * sg);

    // Offsets on top of the follow, in screen axes (x right, z down): the aim pan, then whatever keeps a locked target in frame, then the tank itself.
    let wx = 0, wz = 0;
    if (own) {
      const X = view.hw * R.inner[0], up = view.far * R.inner[1], down = view.near * R.inner[2];
      if (sig) { const len = Math.max(0, (sig.reach - R.panFrom) * R.panGain); wx = Math.cos(sig.a) * len * sg; wz = Math.sin(sig.a) * len * sg; }
      if (lock) {
        const px = (lock.x - bx) * sg - wx, pz = (lock.z - bz) * sg - wz;
        if (px > X) wx += px - X; else if (px < -X) wx += px + X;
        if (pz > down) wz += pz - down; else if (pz < -up) wz += pz + up;
      }
      const tx = (me.x - bx) * sg, tz = (me.z - bz) * sg;
      wx = clamp(wx, tx - X, tx + X); wz = clamp(wz, tz - down, tz + up);
    }
    const grow = Math.hypot(wx, wz) > Math.hypot(s.ox, s.oz);
    const ko = moved ? 1 : ease(dt, grow ? R.panTau : R.panBack);
    s.ox += (wx * sg - s.ox) * ko; s.oz += (wz * sg - s.oz) * ko;

    const hw = m.map.hw, hd = m.map.hd, far = sg > 0 ? R.edge[1] : R.edge[2], near = sg > 0 ? R.edge[2] : R.edge[1];
    const gx = clamp(bx + s.ox, Math.min(0, -hw + R.edge[0]), Math.max(0, hw - R.edge[0]));
    const gz = clamp(bz + s.oz, Math.min(0, -hd + far), Math.max(0, hd - near));

    if (moved) { s.fx = gx; s.fz = gz; }
    else {
      const k = ease(dt, R.tau);
      let mx = (gx - s.fx) * k, mz = (gz - s.fz) * k;
      const len = Math.hypot(mx, mz), cap = R.vmax * dt;
      if (len > cap) { mx *= cap / len; mz *= cap / len; }
      s.fx += mx; s.fz += mz;
    }
    const ox = s.x, oz = s.z;
    if (s.from) {
      s.from.t += dt;
      const e = smooth(Math.min(1, s.from.t / s.from.T));
      s.x = s.from.x + (s.fx - s.from.x) * e; s.z = s.from.z + (s.fz - s.from.z) * e;
      if (e >= 1) s.from = null;
    } else { s.x = s.fx; s.z = s.fz; }
    s.speed = dt > 0 ? Math.hypot(s.x - ox, s.z - oz) / dt : 0;
  }

  // The minimap drag: look at a map point until pan(null).
  function pan(p) { s.free = p ? { x: p.x, z: p.z, alive: true } : null; }

  const state = () => ({ mode: s.mode, target: s.target, x: s.x, z: s.z, off: [s.ox, s.oz], speed: s.speed, gliding: !!s.from, flip: s.sign < 0, yaw: s.yaw });
  return { s, reset, event, update, pan, state };
}
