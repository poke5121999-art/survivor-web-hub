// Techniques studied from Voxel Engine by mattshumer (spawn.co), analysis/audio-physical.md; code is our own.
// Event director: physical-unit events -> loudness/pitch maps, lanes with top-3 reservoirs, grain clouds
// (only the 3 loudest clouds sound), token buckets, explosion layers, beds, fire (doc §3, §6, §7, §8, §11).

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fin = Number.isFinite;

const CLASSES = ['stone', 'wood', 'metal', 'glass', 'soft', 'leaf', 'plaster'];
const CI = {}; CLASSES.forEach((c, i) => { CI[c] = i; });
CI.copper = 2;
const NC = 7;
// per-class (doc §2): full-gain radius, strike brightness, impact gain
const C_REF = [3, 3, 4.5, 3.5, 2.5, 2, 2.5];
const C_BRIGHT = [1, 1.1, 3, 4, 0.6, 2.5, 1.6];
const C_IMPACT = [1, 0.9, 0.8, 0.7, 0.7, 0.5, 0.8];
const IMP = ['imp_stone', 'imp_wood', 'imp_metal', 'imp_glass', 'imp_soft', 'imp_leaf', 'imp_plaster'];
const BRK = ['brk_stone', 'brk_wood', 'brk_metal', 'brk_glass', 'brk_soft', 'imp_leaf', 'brk_plaster'];
const CRACK = ['crack_stone', 'crack_wood', 'crack_metal', 'imp_glass', 'crack_wood', 'crack_wood', 'crack_stone'];
const CREAK = ['creak_stone', 'creak_wood', 'creak_metal', 'creak_stone', null, null, 'creak_stone'];

// lanes: impact c, break 7+c, crack, detach, creak, glass, rubble 18+c
const L_CRACK = 14, L_DETACH = 15, L_CREAK = 16, L_GLASS = 17, L_RUB = 18, NL = 25;
const TOP = 3, LANE_TOP = new Array(NL).fill(TOP);
LANE_TOP[L_DETACH] = 2; LANE_TOP[L_CREAK] = 1; LANE_TOP[L_GLASS] = 1;
const CLOUD_TAU = 0.12, CLOUD_FLOOR = 2.5e-5, CLOUD_GRAINS = 2, CLOUD_LOUDEST = 3, GRAIN_MAX = 1.5;
const QUIET = 0.004, MAX_EVENTS = 1024, CREAK_GAP = 0.3;
const BULK = { impact: 1, thud: 1, break: 1, fracture: 1, detach: 1, glass: 1, rubble: 1 };

// blast kinds [crack, sub, body, pitch, tail] by b (0 generic, 1 rocket, 2 grenade, 3 satchel, 4 fuel drum)
const BLAST = [[1, 1, 1, 1, 0], [1.1, 0.8, 1, 1.05, 0.2], [1.2, 0.6, 0.7, 1.15, 0], [0.8, 1.25, 1.2, 0.86, 0], [0.9, 1.35, 1.25, 0.78, 0.45]];

export function createDirector({ mixer, classOf, isLoose, now }) {
  let L = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
  let tok = 6, tokBig = 8, creakAt = -9, bedE = 0, bedLevel = 0, bedLoop = null, fireLoop = null, fireLevel = 0, fireTarget = 0;
  let fireX = 0, fireY = 0, fireZ = 0, fireIdle = 0, strain = 0;
  let cloudsLive = 0, bedStarted = false;

  const lanes = [];
  for (let i = 0; i < NL; i++) lanes.push({ top: [], E: 0, sx: 0, sy: 0, sz: 0, sxx: 0, szz: 0, rate: 1, cut: 8000, id: null, prio: 1, send: 0.2, idMax: 0, w: 0 });

  const cls = (mat) => { try { const c = CI[classOf(mat)]; return c === undefined ? 0 : c; } catch (e) { return 0; } };
  const loose = (mat) => { try { return !!isLoose(mat); } catch (e) { return false; } };

  function setListener(px, py, pz, fx, fy, fz) {
    if (![px, py, pz, fx, fy, fz].every(fin)) return;
    const l = Math.hypot(fx, fy, fz) || 1;
    L = { x: px, y: py, z: pz, fx: fx / l, fy: fy / l, fz: fz / l };
  }

  // distance, pan, air absorption, propagation delay, reverb multiplier (doc §11.1)
  function locate(x, y, z, ref) {
    const dx = x - L.x, dy = y - L.y, dz = z - L.z, d = Math.max(0.1, Math.hypot(dx, dy, dz));
    const rx = -L.fz, rz = L.fx, rl = Math.hypot(rx, rz) || 1;
    const lat = (dx * rx + dz * rz) / rl;
    const front = (dx * L.fx + dy * L.fy + dz * L.fz) / d;
    const q = d / 60;
    return {
      d, gain: d <= ref ? 1 : ref / d, pan: 0.8 * clamp(lat / (d + 0.3), -1, 1),
      cut: 20000 / (1 + q * Math.sqrt(q)) * (0.3 + 0.35 * (front + 1)),
      delay: d / 343, wet: 0.5 + (d < 50 ? 0.018 * d : 0.9),
    };
  }

  function fire(it, gain, x, y, z, big) {
    const loc = locate(x, y, z, it.ref);
    mixer.submit({
      id: it.id, gain, rate: it.rate, cutoff: Math.min(it.cut, loc.cut), pan: loc.pan, delay: loc.delay,
      send: it.send * loc.wet, prio: it.prio, big,
    }, now());
    if (it.rumble) {
      mixer.submit({ id: 'rumble_hit', gain: it.rumble * Math.pow(loc.gain, 0.7), rate: clamp(it.rate, 0.7, 1.2), cutoff: 1200, pan: loc.pan, delay: loc.delay, send: 0.2, prio: 2 }, now());
    }
  }

  function addCloud(li, it, w) {
    const c = lanes[li], e = it.loud * it.loud * w;
    if (!(e > 0)) return;
    c.E += e; c.sx += e * it.x; c.sy += e * it.y; c.sz += e * it.z; c.sxx += e * it.x * it.x; c.szz += e * it.z * it.z; c.w += e;
    if (it.loud > c.idMax) { c.idMax = it.loud; c.id = it.id; c.rate = it.rate; c.cut = it.cut; c.prio = it.prio; c.send = it.send; c.ref = it.ref; }
  }

  function consider(li, it, w) { // lane reservoir: keep loudest TOP; the rest becomes cloud energy
    bedIn += it.loud * it.loud * (li >= 7 && li < 14 ? 1.5 : 1) * w;
    if (it.loud < QUIET) return;
    const top = lanes[li].top, k = LANE_TOP[li];
    if (top.length < k) { top.push(it); return; }
    let mi = 0;
    for (let i = 1; i < top.length; i++) if (top[i].loud < top[mi].loud) mi = i;
    if (it.loud > top[mi].loud) { addCloud(li, top[mi], 1); top[mi] = it; } else addCloud(li, it, w);
  }

  // ---- builders: event -> item {id, loud, rate, cut, x,y,z, ref, prio, send, rumble}
  let bedIn = 0;
  function mk(id, loud, rate, cut, ev, ref, prio, send, rumble) {
    const loc = locate(ev.x, ev.y, ev.z, ref);
    return { id, loud: loud * loc.gain, rate, cut, x: ev.x, y: ev.y, z: ev.z, ref, prio, send, rumble: rumble ? rumble * loc.gain : 0 };
  }
  const jit = () => 0.92 + Math.random() * 0.16;

  function impactItem(ev, thud) {
    const c = cls(ev.mat), j = ev.mag, v = ev.a;
    if (!(j > 0) || !(v > 0.15)) return null;
    let loud = Math.min(1.3, 0.05 * Math.pow(j * Math.max(v, 0.5), 0.25));
    if (v < 0.5) loud *= (v - 0.15) / 0.35;
    const lo = loose(ev.mat);
    loud *= C_IMPACT[c] * (lo ? 0.85 : 1) * (thud ? 1.3 : 1);
    const mass = j / Math.max(v, 0.3);
    const rate = clamp(1.9 * Math.pow(mass, -0.11), 0.5, 1.9) * (lo ? 1.15 : 1) * jit();
    const cut = 700 * Math.pow(1 + v, 1.35) * C_BRIGHT[c];
    const rumble = (j > (thud ? 800 : 2500)) ? 0.25 + 0.3 * Math.log10(j / (thud ? 800 : 2500) + 1) : 0;
    return [c, mk(IMP[c], loud, rate, cut, ev, C_REF[c], 1, 0.2, rumble)];
  }

  function handle(ev, w, st) { // returns after consider()/immediate fire
    switch (ev.kind) {
      case 'impact': case 'thud': { const r = impactItem(ev, ev.kind === 'thud'); if (r) consider(r[0], r[1], w); break; }
      case 'hammer': {
        const s = clamp(ev.mag, 0, 1);
        const r = impactItem({ ...ev, mag: 40 + 400 * s * s, a: 2 + 6 * s }, false); if (r) consider(r[0], r[1], w); break;
      }
      case 'mobhit': {
        const r = impactItem({ ...ev, mat: ev.mat, mag: 20 + 15 * clamp(ev.mag, 0, 40), a: 3 }, false);
        if (r) { r[1].id = 'imp_soft'; r[1].loud *= 1.3; consider(4, r[1], w); }
        break;
      }
      case 'mobdie': {
        const loc = locate(ev.x, ev.y, ev.z, 3);
        if (tokBig >= 1) { tokBig--; mixer.submit({ id: 'brk_soft', gain: 0.35 * loc.gain, rate: 0.8, cutoff: Math.min(3000, loc.cut), pan: loc.pan, delay: loc.delay, send: 0.2, prio: 1.2 }, now()); }
        break;
      }
      case 'break': {
        const n = ev.mag; if (!(n > 0)) break;
        const c = cls(ev.mat), loud = Math.min(1.2, 0.09 * Math.pow(n, 0.33)) * (loose(ev.mat) ? 0.8 : 1);
        const rate = clamp(1.5 * Math.pow(n, -0.1), 0.6, 1.5) * jit();
        consider(7 + c, mk(BRK[c], loud, rate, 9000 * (c === 0 ? 0.7 : 1), ev, C_REF[c] * 1.5, 1.2, 0.25, n > 250 ? 0.25 + 0.3 * Math.log10(n / 250 + 1) : 0), w);
        break;
      }
      case 'fracture': {
        const n = ev.mag; if (!(n > 0)) break;
        const c = cls(ev.mat), ratio = 1 + Math.log2(1 + n) * 0.1;
        consider(L_CRACK, mk(CRACK[c], clamp(0.22 + 0.12 * (ratio - 1), 0.15, 0.6), jit(), 9000, ev, C_REF[c], 1, 0.3), w);
        break;
      }
      case 'detach': {
        const m = ev.mag * 10; if (!(m > 1)) break; // voxels -> kg-ish
        const c = cls(ev.mat), loud = clamp(0.19 * Math.log10(m) - 0.12, 0.08, 1.1);
        consider(L_DETACH, mk(c === 0 ? 'tear' : BRK[c], loud, clamp(1.7 - 0.22 * Math.log10(m), 0.6, 1.5) * jit(), 8000, ev, C_REF[c], 1.4, 0.3, m > 150 ? 0.25 + 0.3 * Math.log10(m / 150) : 0), w);
        break;
      }
      case 'glass': {
        const n = ev.mag; if (!(n > 0)) break;
        const loud = Math.min(0.55, 0.2 * Math.pow(n, 0.25));
        const it = mk('brk_glass', loud, jit(), 14000, ev, 4, 1.5, 0.25);
        consider(L_GLASS, it, w);
        const k = clamp(Math.round(Math.log2(n + 1)) - 1, 0, 5);
        for (let i = 0; i < k && st.glassShower < 5; i++, st.glassShower++) {
          mixer.submit({ id: 'tinkle', gain: loud * (0.7 - 0.1 * i) * (it.loud / Math.max(loud, 1e-6)), rate: jit(), cutoff: 14000, pan: locate(ev.x, ev.y, ev.z, 4).pan, delay: 0.06 + 0.09 * i + locate(ev.x, ev.y, ev.z, 4).delay, send: 0.2, prio: 1.2 }, now());
        }
        break;
      }
      case 'creak': {
        const r = ev.mag;
        if (!(r >= 0.8)) break;
        const c = cls(ev.mat), id = CREAK[c];
        strain += r;
        if (!id || now() - creakAt < CREAK_GAP) break;
        const nodes = Math.max(1, (fin(ev.b) ? ev.b : 0.1) * 1000);
        const rate = clamp(1.5 - 0.3 * Math.log10(nodes * 0.01), 0.75, 1.6);
        consider(L_CREAK, mk(id, clamp(0.07 + 0.2 * (r - 0.7), 0.05, 0.22), rate, 280 + 1100 * clamp(r - 0.5, 0, 1) + 1500, ev, C_REF[c] * 2, 1.1, 0.33), w);
        break;
      }
      case 'rubble': {
        const n = clamp(ev.mag, 0, 200); if (!(n > 0)) break;
        const c = cls(ev.mat), lo = loose(ev.mat);
        const it = mk(IMP[c], 0.07 * (lo ? 1 : 0.8), 1.25 * (lo ? 1.15 : 1), 3500 * C_BRIGHT[c], ev, C_REF[c], 0.9, 0.15);
        addCloud(L_RUB + c, it, n * w);
        break;
      }
      case 'explosion': st.blasts.push(ev); break;
      case 'shot': {
        const loc = locate(ev.x, ev.y, ev.z, 25);
        if (tokBig >= 1) { tokBig--; mixer.submit({ id: 'gun', gain: 0.46 * loc.gain * (ev.b ? 1.5 : 1), rate: jit(), cutoff: Math.min(18000, loc.cut), pan: loc.pan, delay: loc.delay, send: 0.6 * loc.wet, prio: 3, big: true }, now()); }
        break;
      }
      case 'ignite': {
        const loc = locate(ev.x, ev.y, ev.z, 6);
        mixer.submit({ id: 'ignite', gain: clamp(0.15 + 0.05 * Math.log2(1 + ev.mag), 0.1, 0.4) * loc.gain, rate: jit(), cutoff: Math.min(8000, loc.cut), pan: loc.pan, delay: loc.delay, send: 0.15, prio: 1 }, now());
        break;
      }
      default: break; // unknown kinds ignored
    }
  }

  function explosion(ev, lite) {
    const radius = fin(ev.mag) ? ev.mag : 3, power = fin(ev.a) ? ev.a : 1;
    const size = radius * Math.sqrt(Math.max(power, 0.05)), ref = 5 + 4 * size;
    const loc = locate(ev.x, ev.y, ev.z, ref);
    const amp = clamp(0.5 + 0.2 * size, 0.4, 1.3), g = loc.gain, far = clamp((loc.d - 40) / 160, 0, 1), near = 1 - far;
    const K = BLAST[clamp(ev.b | 0, 0, 4)];
    const pitch = clamp(1.2 - 0.08 * size, 0.62, 1.2) * K[3] / 1, subRate = clamp(1.15 - 0.07 * size, 0.6, 1.15);
    const base = { pan: loc.pan, delay: loc.delay, big: true };
    const air = Math.min(18000, loc.cut);
    mixer.submit({ ...base, id: 'exp_crack', gain: amp * K[0] * g * near * near, rate: pitch, cutoff: air, send: 0.45 * loc.wet, prio: 4 }, now());
    mixer.submit({ ...base, id: 'exp_body', gain: amp * K[2] * Math.pow(g, 0.9), rate: pitch, cutoff: air, send: 0.6 * loc.wet, prio: 3.5, delay: loc.delay + 0.004 }, now());
    if (!lite) {
      mixer.submit({ ...base, id: 'exp_sub', gain: amp * K[1] * Math.pow(g, 0.8) * (1 - 0.6 * far), rate: subRate, cutoff: 2000, send: 0.1, prio: 4 }, now());
      mixer.submit({ ...base, id: 'exp_far', gain: amp * Math.pow(g, 0.7) * (far * 1.3 + K[4] * 0.5), rate: 1, cutoff: 400, send: 0.3, prio: 3 }, now());
      if (near > 0.3) mixer.submit({ ...base, id: 'exp_debris', gain: 0.5 * amp * g, rate: pitch, cutoff: air, send: 0.3, prio: 2 }, now());
    }
    const level = amp * g;
    if (level > 0.3) mixer.blast(clamp(level - 0.3, 0, 0.85), loc.delay);
    bedIn += 3 * level * level;
  }

  function handleEvents(events, dtIn) {
    const dt = clamp(fin(dtIn) ? dtIn : 0.016, 0.001, 0.1), t = now();
    tok = Math.min(6, tok + dt * 200); tokBig = Math.min(8, tokBig + dt * 240);
    bedIn = 0;
    for (const l of lanes) l.top.length = 0;
    const st = { blasts: [], glassShower: 0 };
    const n = events ? events.length : 0, stride = Math.max(1, Math.ceil(n / MAX_EVENTS));
    for (let i = 0; i < n; i++) {
      const ev = events[i];
      if (!ev || typeof ev.kind !== 'string') continue;
      const bulk = BULK[ev.kind] === 1;
      if (bulk && stride > 1 && i % stride) continue;
      const m = ev.mag;
      if (!fin(ev.x) || !fin(ev.y) || !fin(ev.z) || Math.abs(ev.x) > 1e5 || Math.abs(ev.y) > 1e5 || Math.abs(ev.z) > 1e5 || (m !== undefined && (!fin(m) || Math.abs(m) > 1e12))) continue;
      handle(ev, bulk ? stride : 1, st);
    }
    // explosions: first 2 full, next 2 lite, rest only feed the bed
    for (let i = 0; i < st.blasts.length; i++) {
      if (i < 4) explosion(st.blasts[i], i >= 2); else bedIn += 1;
    }
    // play loudest of each lane rank by rank; the rest of the tokens' shortfall falls to the clouds
    for (let rank = 0; rank < TOP; rank++) {
      for (let li = 0; li < NL; li++) {
        const top = lanes[li].top;
        if (rank === 0 && top.length > 1) top.sort((a, b) => b.loud - a.loud);
        const it = top[rank];
        if (!it) continue;
        if (tok >= 1) {
          tok -= 1; if (li === L_CREAK) creakAt = t;
          fire(it, it.loud, it.x, it.y, it.z, false);
        } else addCloud(li, it, 1);
      }
    }
    // clouds: only the CLOUD_LOUDEST loudest lanes sound each frame
    const live = [];
    for (let li = 0; li < NL; li++) if (lanes[li].E > CLOUD_FLOOR) live.push(li);
    cloudsLive = live.length;
    if (live.length > CLOUD_LOUDEST) live.sort((a, b) => lanes[b].E - lanes[a].E);
    for (let k = 0; k < Math.min(CLOUD_LOUDEST, live.length); k++) cloudGrains(lanes[live[k]]);
    const dec = Math.exp(-dt / CLOUD_TAU);
    for (const c of lanes) {
      if (c.E <= 0) continue;
      c.E *= dec; c.sx *= dec; c.sy *= dec; c.sz *= dec; c.sxx *= dec; c.szz *= dec; c.w *= dec;
      if (c.E < CLOUD_FLOOR) { c.E = c.sx = c.sy = c.sz = c.sxx = c.szz = c.w = 0; c.idMax = 0; c.id = null; }
    }
    updateBed(dt);
    updateFire(dt);
    strain *= Math.exp(-dt / 8);
    mixer.flush(t);
  }

  function cloudGrains(c) {
    if (!c.id || !(c.w > 0)) return;
    const cx = c.sx / c.w, cy = c.sy / c.w, cz = c.sz / c.w;
    const sp = Math.min(6, Math.sqrt(Math.max(0, c.sxx / c.w - cx * cx) + Math.max(0, c.szz / c.w - cz * cz)));
    for (let g = 0; g < CLOUD_GRAINS && c.E > CLOUD_FLOOR; g++) {
      const loud = Math.min(GRAIN_MAX, Math.sqrt(0.4 * c.E));
      c.E *= 0.6;
      const x = cx + (Math.random() * 2 - 1) * sp * 2, z = cz + (Math.random() * 2 - 1) * sp * 2;
      const gain = loud * (0.5 + 1.5 * Math.random()) * 0.6;
      const loc = locate(x, cy, z, 1e9); // intensity already includes distance attenuation
      mixer.submit({
        id: c.id, gain, rate: c.rate * (0.8 + 0.5 * Math.random()), cutoff: Math.min(c.cut, loc.cut), pan: loc.pan,
        delay: loc.delay + Math.random() * 0.045, send: c.send * loc.wet, prio: c.prio * 0.8,
      }, now());
    }
  }

  function updateBed(dt) {
    bedE += Math.min(bedIn, 5 * dt);
    bedE *= Math.exp(-dt / 0.4);
    if (!bedE || !fin(bedE)) bedE = 0;
    const level = clamp((Math.sqrt(bedE) - 0.3) * 1.1, 0, 1);
    if (Math.abs(level - bedLevel) > 0.03 || (level === 0 && bedLevel !== 0)) {
      bedLevel = level;
      if (!bedLoop && level > 0.03) bedLoop = mixer.createLoop('loop_brown', false);
      if (bedLoop) bedLoop.set(0.55 * level * level, 90 + 420 * level, 1, 0);
    }
  }

  function setFire(intensity, x, y, z) {
    fireTarget = fin(intensity) ? clamp(intensity, 0, 1) : 0;
    if (fin(x) && fin(y) && fin(z)) { fireX = x; fireY = y; fireZ = z; }
  }

  function updateFire(dt) {
    fireLevel += (fireTarget - fireLevel) * (1 - Math.exp(-dt / 0.4));
    fireIdle = fireTarget > 0.01 ? 0 : fireIdle + dt;
    if (fireLevel > 0.02 && !fireLoop) fireLoop = mixer.createLoop('loop_fire', false);
    if (fireLoop) {
      const loc = locate(fireX, fireY, fireZ, 6);
      fireLoop.set(0.5 * Math.sqrt(fireLevel) * loc.gain * (fireLevel > 0.02 ? 1 : 0), Math.min(9000, loc.cut), 1, loc.pan);
      if (fireIdle > 3 && fireLevel < 0.01) { fireLoop.stop(); fireLoop = null; }
    }
  }

  return { setListener, handleEvents, setFire, stats: () => ({ clouds: cloudsLive }), CLASSES };
}
