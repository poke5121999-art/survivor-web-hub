// A guest's own mech and its own gun, driven on the guest's machine. Pure: runs in Node.
// The host is still the judge: every snapshot says where the mech stood after the host ran input number N. The guest
// keeps the inputs it sent after N and walks them again from that spot with the host's own walk(), so the mech answers
// the stick at once and still ends up where the host says. What the walk cannot know in advance (a knock-back, a dash,
// a respawn) arrives as a correction, and the picture glides over it instead of jumping.
import { walk, gripAt, turnRate, weaponRange, bounceDir, weaponOf, skillReady, locked } from './sim.js';
import { castStatic } from './maps.js';
import { TICK } from './data.js';

const KEEP = 90;          // inputs remembered: 3 s, far more than any round trip
const AGREE = 0.03;       // metres: the host's rounding, not a disagreement
const TELEPORT = 4;       // metres: a respawn or a blink is shown at once
const BLEND = 12;         // per second: how fast a correction melts away

// m: the mirror match. id: this guest's unit. The mirror's unit keeps telling what the host knows about it (stunned,
// slowed, casting); the body below inherits those and owns only the motion.
export function createPredictor(m, id) {
  const unit = m.units[id];
  const body = Object.create(unit);
  Object.assign(body, { x: unit.x, z: unit.z, px: unit.x, pz: unit.z, vx: 0, vz: 0, kx: 0, kz: 0, heading: unit.heading });
  // free: the stick drives the mech. Not free (dead, dashing): the host moves it and the picture follows the mirror.
  let seq = 0, sent = [], free = false, shownFree = false, ex = 0, ez = 0, sx = unit.x, sz = unit.z;

  const step = (e) => {
    body.px = body.x; body.pz = body.z;
    walk(m, body, e.inp, gripAt(m.map, body.x, body.z, body));
    e.x = body.x; e.z = body.z; e.vx = body.vx; e.vz = body.vz;
  };

  // Where one more tick with this input would put the body, without moving it.
  const peek = (inp) => {
    const keep = { ...body };
    walk(m, body, inp, gripAt(m.map, body.x, body.z, body));
    const at = [body.x, body.z];
    for (const k of Object.keys(body)) if (!(k in keep)) delete body[k];
    Object.assign(body, keep);
    return at;
  };

  return {
    get seq() { return seq; },
    get free() { return free; },
    get x() { return body.x; },
    get z() { return body.z; },

    // One local tick with the input just sent. Returns the input's number.
    tick(inp) {
      seq++;
      if (!free) return seq;
      const e = { q: seq, inp };
      step(e);
      sent.push(e);
      if (sent.length > KEEP) sent.shift();
      return seq;
    },

    // The host's word: after input `applied` the mech stood at (x, z), alive or not, dashing or not.
    // Returns how far the body had to move to agree (metres; 0 when it already did).
    correct(applied, x, z, alive, dash) {
      const was = free;
      free = alive && !dash;
      // Taking over from the host: its spot is the start, and the record of it is what later snapshots are compared with.
      if (!free || !was) { body.x = body.px = x; body.z = body.pz = z; body.vx = body.vz = 0; sent = [{ q: applied, x, z, vx: 0, vz: 0 }]; return 0; }
      while (sent.length && sent[0].q < applied) sent.shift();
      const at = sent.length && sent[0].q === applied ? sent[0] : null;
      if (at && Math.hypot(at.x - x, at.z - z) < AGREE) return 0;
      const bx = body.x, bz = body.z;
      if (at) { at.x = x; at.z = z; body.vx = at.vx; body.vz = at.vz; }
      body.x = body.px = x; body.z = body.pz = z;
      for (const e of sent) if (e.q > applied) step(e);
      // The body moved under the picture: the offset keeps the picture where it was.
      ex += bx - body.x; ez += bz - body.z;
      return Math.hypot(bx - body.x, bz - body.z);
    },

    // Where to draw the mech now. frac: how far into the current local tick. dt: seconds since the last call.
    // (mx, mz): where the mirror would draw it. inp: what the stick says this frame.
    // The mech is drawn on its way to where the tick in progress will put it, not on its way from the tick before: the
    // stick shows on screen in the frame it moves, without waiting for the next tick.
    // Returns { x, z, dx, dz, heading, free }; dx, dz is one tick of motion.
    pose(frac, dt, mx, mz, inp) {
      let tx = mx, tz = mz, dx = 0, dz = 0;
      if (free) {
        const to = inp ? peek(inp) : [body.x, body.z];
        dx = to[0] - body.x; dz = to[1] - body.z;
        tx = body.x + dx * frac; tz = body.z + dz * frac;
      }
      if (free !== shownFree) { shownFree = free; ex = sx - tx; ez = sz - tz; }
      if (Math.hypot(ex, ez) > TELEPORT) ex = ez = 0;
      const k = Math.exp(-BLEND * dt);
      ex *= k; ez *= k;
      sx = tx + ex; sz = tz + ez;
      return { x: sx, z: sz, dx, dz, heading: body.heading, free };
    },
  };
}

const CREDIT_AGE = 2;     // seconds a predicted shot, flash or impact waits for the host's copy before it is forgotten
const SAME_SPOT = 2.5;    // metres: the host's impact this close to a predicted one is the same impact

function segCircle(x, z, ex, ez, cx, cz, r) {
  const fx = x - cx, fz = z - cz, a = ex * ex + ez * ez, b = 2 * (fx * ex + fz * ez), c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const d = b * b - 4 * a * c;
  if (a < 1e-9 || d < 0) return 2;
  const t = (-b - Math.sqrt(d)) / (2 * a);
  return t >= 0 && t <= 1 ? t : 2;
}

// The guest's own main weapon, shown the moment the trigger is pulled. The host still fires the real shot and judges
// every hit; here a look-alike flies at once, and the host's copy of that shot, its muzzle flash and its impact are
// swallowed when they arrive so nothing shows twice. A host shot nobody predicted is drawn as it comes.
// Lobbed shells are not predicted: only their muzzle flash is. A ray (the medic's link) is predicted as a line to the
// first mech or wall; a charge weapon is not predicted at all, its beam comes from the host.
export function createGunner(m, id) {
  const unit = m.units[id], w = weaponOf(unit);
  const rapid = (unit.def.skills.find((s) => s.rapid) || { rapid: 1 }).rapid;
  let cd = 0, barrel = 0, nextId = -1, flying = [], aim = unit.aim;
  const owed = { shot: [], fire: [], impact: [], ray: [] };      // predictions the host has not echoed yet
  const hidden = new Set();                             // host shot ids that a prediction already stands for
  const fresh = (list, now) => { while (list.length && now - list[0].at > CREDIT_AGE) list.shift(); };

  return {
    // One local tick. (x, z): where the predictor has the mech. now: seconds. Returns the events to play this frame.
    tick(inp, x, z, now) {
      const events = [];
      if (cd > 0) cd = Math.max(0, cd - TICK * (unit.rapidT > 0 ? rapid : 1));
      // The turret turns at the host's rate, so the look-alike leaves along the barrel the host will fire along.
      aim = turnToward(aim, inp.aim, turnRate(unit) * TICK);
      const can = unit.alive && free(unit) && !w.charge && !(SKILL_KEYS.some((k, i) => inp[k] && skillReady(unit, i)));
      if (inp.fire && cd <= 0 && can) {
        cd = w.cd;
        owed.fire.push({ at: now });
        let side = 0;
        if (w.alt) { barrel ^= 1; side = barrel ? w.alt : -w.alt; }
        if (w.ray) {
          const dx = Math.cos(aim), dz = Math.sin(aim);
          let len = w.range * Math.min(1, castStatic(m.map, x, z, x + dx * w.range, z + dz * w.range, 0.15)), on = 'none';
          for (const u of m.units) {
            if (u === unit || !u.alive || (u.team === unit.team && u.hp >= u.maxHp)) continue;
            const along = (u.x - x) * dx + (u.z - z) * dz;
            if (along > 0 && along <= len + u.radius && Math.abs((u.x - x) * dz - (u.z - z) * dx) < w.width / 2 + u.radius) { len = Math.max(0.5, along); on = u.team === unit.team ? 'ally' : 'foe'; }
          }
          owed.ray.push({ at: now });
          events.push({ t: 'ray', id, x0: x, z0: z, x1: x + dx * len, z1: z + dz * len, on, local: true });
        }
        for (let i = 0; i < (w.lob || w.ray ? 0 : w.n || 1); i++) {
          const n = w.n || 1, a = aim + (i - (n - 1) / 2) * (w.fan || 0), dx = Math.cos(a), dz = Math.sin(a), off = unit.radius + 0.25;
          let sx = x + dx * off - dz * side, sz = z + dz * off + dx * side;
          if (castStatic(m.map, x, z, sx, sz, w.r) <= 1) { sx = x; sz = z; }
          flying.push({ id: nextId--, team: unit.team, color: unit.color, owner: id, x: sx, z: sz, px: sx, pz: sz, dx, dz, speed: w.speed, left: weaponRange(unit), r: w.r, vis: w.vis, bounce: w.bounce || 0 });
          owed.shot.push({ at: now });
        }
        if (!w.ray) events.push({ t: 'fire', id, vis: w.vis, x, z, a: aim, side, local: true });
      }
      // A shot flies its first tick in the tick it is fired, so it leaves the muzzle in the frame the trigger is pulled.
      for (let i = flying.length - 1; i >= 0; i--) {
        const s = flying[i], len = Math.min(s.left, s.speed * TICK), ex = s.dx * len, ez = s.dz * len;
        s.px = s.x; s.pz = s.z;
        let best = castStatic(m.map, s.x, s.z, s.x + ex, s.z + ez, s.r * 0.5), on = 'wall';
        for (const p of m.props) { if (!p.alive) continue; const t = segCircle(s.x, s.z, ex, ez, p.x, p.z, p.r + s.r); if (t < best) { best = t; on = 'prop'; } }
        // A piercing shot flies through mechs; the host shows where it hurt them.
        if (!w.pierce) for (const u of m.units) { if (u.team === unit.team || !u.alive) continue; const t = segCircle(s.x, s.z, ex, ez, u.x, u.z, u.radius + s.r); if (t < best) { best = t; on = 'unit'; } }
        if (best > 1) { s.x += ex; s.z += ez; s.left -= len; if (s.left > 1e-4) continue; on = 'end'; }
        else { s.x += ex * best; s.z += ez * best; s.left -= len * best; }
        if (on === 'wall' && s.bounce > 0 && s.left > 0.5) {
          s.bounce--;
          s.x -= s.dx * 0.1; s.z -= s.dz * 0.1;
          [s.dx, s.dz] = bounceDir(m.map, s.x, s.z, s.dx, s.dz, s.r * 0.5);
          continue;
        }
        events.push({ t: 'impact', vis: s.vis, on, x: s.x, z: s.z, dx: s.dx, dz: s.dz, splash: w.splash || 0, local: true });
        owed.impact.push({ at: now, x: s.x, z: s.z });
        flying.splice(i, 1);
      }
      return events;
    },

    // The shots to draw: the host's list without the ones a prediction stands for, plus the predicted ones placed
    // frac of a local tick along. Everything is drawn at px + (x - px) * alpha, so each is laid out for that alpha.
    shots(host, frac, alpha, now) {
      fresh(owed.shot, now);
      const out = [], live = new Set();
      for (const s of host) {
        if (s.owner !== id || s.vis !== w.vis) { out.push(s); continue; }
        live.add(s.id);
        if (!hidden.has(s.id)) { if (!owed.shot.length) { out.push(s); continue; } owed.shot.shift(); hidden.add(s.id); }
      }
      for (const k of hidden) if (!live.has(k)) hidden.delete(k);
      for (const s of flying) {
        const dx = s.x - s.px, dz = s.z - s.pz, x = s.px + dx * frac, z = s.pz + dz * frac;
        out.push({ ...s, px: x - dx * alpha, pz: z - dz * alpha, x: x + dx * (1 - alpha), z: z + dz * (1 - alpha) });
      }
      return out;
    },

    // false for a host event that a prediction already played.
    keep(e, now) {
      if (e.t === 'fire' && e.id === id && e.vis === w.vis) { fresh(owed.fire, now); if (owed.fire.length) { owed.fire.shift(); return false; } }
      if (e.t === 'ray' && e.id === id) { fresh(owed.ray, now); if (owed.ray.length) { owed.ray.shift(); return false; } }
      if (e.t === 'impact' && e.on === 'bounce') return !(e.vis === w.vis && flying.length + owed.shot.length);
      if (e.t === 'impact' && e.vis === w.vis && !w.lob) {
        fresh(owed.impact, now);
        const i = owed.impact.findIndex((o) => Math.hypot(o.x - e.x, o.z - e.z) < SAME_SPOT);
        if (i >= 0) { owed.impact.splice(i, 1); return false; }
      }
      return true;
    },
  };
}

const SKILL_KEYS = ['s1', 's2', 'ult'];
function turnToward(a, b, max) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + Math.max(-max, Math.min(max, d));
}
const free = (u) => !(u.stunT > 0) && !locked(u) && !u.cast && !u.dash;
