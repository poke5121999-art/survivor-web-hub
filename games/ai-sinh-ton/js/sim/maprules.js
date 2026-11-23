// Per-tick rules of the stage's map, read from B.plan.hazards (rooms.js): only the hazards of the room the current wave is
// fought in act. Pure and deterministic: timing comes from B.waveT, nothing draws from B.rng.
//   poison    units inside take a damage over time of `dps` of their max health per second (bosses a fifth of it)
//   wind      every `every` s a gust (after `warn` s of warning) pushes units for `on` s at `push` m/s along `ang`
//   current   a band |z - h.z| < r across the pad: units in it are slowed by `slow` and drift `drift` m/s along `ang`
//   collapse  `warn` s before `at` the ground cracks; at `at` units inside lose `hit` of their max health and are thrown out,
//             and from then on the spot is a hole nobody stands in (for the rest of the stage)
// The view reads the same timing through hazardState().
import { _test } from './battle.js?v=20261122a';

const roomNow = (B) => (B.plan.waveRoom ? B.plan.waveRoom[Math.max(0, B.wave - 1)] : B.wave - 1);
// the first wave of the stage fought in hazard h's room: a collapse counts its time from that wave's start
const isFirstIn = (B, h) => B.plan.firstWave && B.plan.firstWave[h.room] === B.wave - 1;

// what a hazard is doing at the battle's current time: 'idle' | 'warn' | 'on' | 'gone' (a collapsed hole), and 0..1 within it
export function hazardState(B, h, i) {
  const st = B.mapState && B.mapState[i];
  if (h.kind === 'collapse') {
    if (st && st.fell) return { s: 'gone', k: 1 };
    if (!isFirstIn(B, h)) return { s: 'idle', k: 0 };
    const d = h.at - B.waveT; return d <= h.warn && d > 0 ? { s: 'warn', k: 1 - d / h.warn } : { s: 'idle', k: 0 };
  }
  if (h.kind === 'wind') {
    const p = (B.waveT + h.off) % h.every;
    if (p < h.warn) return { s: 'warn', k: p / h.warn };
    if (p < h.warn + h.on) return { s: 'on', k: (p - h.warn) / h.on };
    return { s: 'idle', k: 0 };
  }
  return { s: 'on', k: 1 };
}

function inBand(h, u) { return Math.abs(u.z - h.z) < h.r; }
function inDisc(h, u, pad = 0) { return Math.hypot(u.x - h.x, u.z - h.z) < h.r + pad; }

export function mapTick(B, dt) {
  const hz = B.plan && B.plan.hazards; if (!hz || !hz.length) return;
  const room = roomNow(B); if (!B.mapState) B.mapState = {};
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i]; if (h.room !== room) continue;
    const st = B.mapState[i] || (B.mapState[i] = {});
    if (h.kind === 'poison') {
      for (const u of B.units) {
        if (!u.alive || u.fly || u.air || !inDisc(h, u)) continue;
        const dps = u.maxHp * h.dps * (u.boss ? 0.2 : 1); const cur = u.status.poison;
        if (!cur) B.emit({ e: 'status', uid: u.uid, k: 'poison', dur: 0.6 });
        if (!cur || cur.t < 0.6 || (cur.dps || 0) < dps) u.status.poison = { t: 0.6, v: 0, dps: Math.max(dps, cur ? cur.dps || 0 : 0), src: cur ? cur.src : 0 };
      }
    } else if (h.kind === 'wind') {
      const s = hazardState(B, h, i);
      if (s.s === 'on') {
        const k = Math.sin(Math.PI * s.k); const vx = Math.cos(h.ang) * h.push * k * dt; const vz = Math.sin(h.ang) * h.push * k * dt;
        for (const u of B.units) { if (!u.alive || u.boss || !inDisc(h, u)) continue; u.x += vx; u.z += vz; }
      }
      if (s.s !== st.last) { if (s.s === 'warn' || s.s === 'on') B.emit({ e: 'hazard', i, kind: 'wind', s: s.s }); st.last = s.s; }
    } else if (h.kind === 'current') {
      const vx = Math.cos(h.ang) * h.drift * dt; const vz = Math.sin(h.ang) * h.drift * dt;
      for (const u of B.units) {
        if (!u.alive || u.fly || u.air || !inBand(h, u)) continue;
        const cur = u.status.slow; if (!cur || (cur.t < 0.25 && cur.v <= h.slow)) u.status.slow = { t: 0.25, v: Math.max(h.slow, cur ? cur.v : 0), dps: 0, src: 0 };
        if (!u.boss) { u.x += vx; u.z += vz; }
      }
    } else if (h.kind === 'collapse') {
      if (!st.fell && isFirstIn(B, h) && B.waveT >= h.at) {
        st.fell = true; B.emit({ e: 'hazard', i, kind: 'collapse', s: 'gone', x: h.x, z: h.z, r: h.r });
        for (const u of B.units) if (u.alive && !u.fly && inDisc(h, u)) _test.hurt(B, null, u, u.maxHp * h.hit * (u.boss ? 0.2 : 1), { dot: true });
      } else if (!st.fell) {
        const s = hazardState(B, h, i); if (s.s !== st.last) { if (s.s === 'warn') B.emit({ e: 'hazard', i, kind: 'collapse', s: 'warn', x: h.x, z: h.z, r: h.r }); st.last = s.s; }
      }
      if (st.fell) for (const u of B.units) {
        if (!u.alive || u.fly || u.air || !inDisc(h, u, u.r)) continue;
        let dx = u.x - h.x; let dz = u.z - h.z; if (Math.hypot(dx, dz) < 1e-6) { dx = 1; dz = 0; } const d = Math.hypot(dx, dz); const want = h.r + u.r + 0.02;
        u.x = h.x + (dx / d) * want; u.z = h.z + (dz / d) * want;
      }
    }
  }
}
