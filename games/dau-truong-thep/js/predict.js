// A guest's own mech, driven on the guest's machine. Pure: runs in Node.
// The host is still the judge: every snapshot says where the mech stood after the host ran input number N. The guest
// keeps the inputs it sent after N and walks them again from that spot with the host's own walk(), so the mech answers
// the stick at once and still ends up where the host says. What the walk cannot know in advance (a knock-back, a dash,
// a respawn) arrives as a correction, and the picture glides over it instead of jumping.
import { walk, gripAt } from './sim.js';

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
    walk(m, body, e.inp, gripAt(m.map, body.x, body.z));
    e.x = body.x; e.z = body.z; e.vx = body.vx; e.vz = body.vz;
  };

  return {
    get seq() { return seq; },

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
    correct(applied, x, z, alive, dash) {
      const was = free;
      free = alive && !dash;
      // Taking over from the host: its spot is the start, and the record of it is what later snapshots are compared with.
      if (!free || !was) { body.x = body.px = x; body.z = body.pz = z; body.vx = body.vz = 0; sent = [{ q: applied, x, z, vx: 0, vz: 0 }]; return; }
      while (sent.length && sent[0].q < applied) sent.shift();
      const at = sent.length && sent[0].q === applied ? sent[0] : null;
      if (at && Math.hypot(at.x - x, at.z - z) < AGREE) return;
      const bx = body.x, bz = body.z;
      if (at) { at.x = x; at.z = z; body.vx = at.vx; body.vz = at.vz; }
      body.x = body.px = x; body.z = body.pz = z;
      for (const e of sent) if (e.q > applied) step(e);
      // The body moved under the picture: the offset keeps the picture where it was.
      ex += bx - body.x; ez += bz - body.z;
    },

    // Where to draw the mech now. frac: how far into the current local tick. dt: seconds since the last call.
    // (mx, mz): where the mirror would draw it. Returns { x, z, dx, dz, heading, free }; dx, dz is one tick of motion.
    pose(frac, dt, mx, mz) {
      const dx = free ? body.x - body.px : 0, dz = free ? body.z - body.pz : 0;
      const tx = free ? body.px + dx * frac : mx, tz = free ? body.pz + dz * frac : mz;
      if (free !== shownFree) { shownFree = free; ex = sx - tx; ez = sz - tz; }
      if (Math.hypot(ex, ez) > TELEPORT) ex = ez = 0;
      const k = Math.exp(-BLEND * dt);
      ex *= k; ez *= k;
      sx = tx + ex; sz = tz + ez;
      return { x: sx, z: sz, dx, dz, heading: body.heading, free };
    },
  };
}
