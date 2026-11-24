// Per-tick rules of the stage's map, read from B.plan.hazards (rooms.js): only the hazards of the room the current wave is
// fought in act. Pure and deterministic: timing comes from B.waveT, nothing draws from B.rng.
//   poison    the team's units inside take a damage over time of `dps` of their max health per second while above `floor`
//             of it: it wears a unit down but never kills on its own, nor sets off a low-health skill by itself; monsters are
//             at home in it (it would thin the horde the stage is balanced on)
//   wind      every `every` s a gust (after `warn` s of warning) pushes units for `on` s at `push` m/s along `ang`
//   current   a band |z - h.z| < r across the pad: units in it are slowed by `slow` and drift `drift` m/s along `ang`
//   collapse  `warn` s before `at` the ground cracks; at `at` units inside lose `hit` of their max health and are thrown out,
//             and from then on the spot is a hole nobody stands in (for the rest of the stage)
// The view reads the same timing through hazardState().
// The stage's special rule (plan.mode, rooms.js modeOf) runs here too, from the same tick, with nothing drawn from B.rng:
//   defend   the Seed Egg (Trứng Mầm) stands in the middle of each fight room: a unit of the team's side that never acts,
//            with `taunt` so monsters go for it as well as the heroes; healers may mend it; it regains `heal` of its health
//            when a new wave starts. Broken: the stage is lost.
//   survive  waves 1-4 last `time` s: when the wave's own packs are out, its packs come again (cycled, at most `cap` alive);
//            at the bell the rest of the horde flees (gone without a kill) and the wave is cleared. The boss wave is as usual.
//   chase    in waves 1-4 one monster of the wave carries the Core (Lõi): `hpK` times its health, it does not fight, it runs
//            from gate to gate of the room at `speed` (slowed, stunned or frozen like anyone), catching its breath `rest` s at
//            each, and after `legs` gates it is out: the stage is lost. Brought down, the Core is safe.
// B.mapState.mode holds the rule's state; modeState(B) is what the view and the HUD read. The battle needs no hook: a loss is
// called here (B.phase 'lost', the 'lost' event with `why`), and a broken egg or a fleeing carrier leaves monsters standing,
// so the step's own end-of-wave check cannot overrule it in the same tick.
import { _test } from './battle.js?v=20261124b';
import { WAVES } from './rooms.js?v=20261124b';

export const MODES = {
  defend: { title: 'BẢO VỆ TRỨNG MẦM', rule: 'Trứng vỡ là thua', hpK: 1.6, heal: 0.3, taunt: 0.5, r: 0.75 },
  survive: { title: 'SỐNG SÓT 30 GIÂY', rule: 'Quái ra liên tục', time: 30, cap: 36 },
  chase: { title: 'ĐUỔI THEO LÕI', rule: 'Hạ nó trước khi thoát', hpK: 2.5, speed: 1.9, legs: 4, rest: 2.5 },
};

const POISON_FLOOR = 0.65;
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
  if (B.plan && B.plan.mode) modeTick(B, dt);
  const hz = B.plan && B.plan.hazards; if (!hz || !hz.length) return;
  const room = roomNow(B); if (!B.mapState) B.mapState = {};
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i]; if (h.room !== room) continue;
    const st = B.mapState[i] || (B.mapState[i] = {});
    if (h.kind === 'poison') {
      // the health is drained directly, not dealt as damage: a hit would charge the unit's ultimate (and the poison would
      // speed the team up instead of wearing it down)
      for (const u of B.units) {
        if (!u.alive || u.team !== 0 || u.fly || u.air || !inDisc(h, u)) continue;
        if (!u.status.poison) B.emit({ e: 'status', uid: u.uid, k: 'poison', dur: 0.6 });
        u.status.poison = { t: 0.6, v: 0, dps: 0, src: 0 };
        u.hp = Math.max(Math.min(u.hp, u.maxHp * POISON_FLOOR), u.hp - u.maxHp * h.dps * dt);
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

// ---------- special stages ----------
const gatesNow = (B) => B.plan.rooms[roomNow(B)].gates;
function lose(B, why) { B.phase = 'lost'; B.emit({ e: 'lost', wave: B.wave, why }); }
// a unit taken off the field without a kill (a fleeing monster): the books count its health as lost to no one
function vanish(B, u) {
  if (u.team === 1 && !u.summon) { B.book.enemyLost += Math.max(0, u.hp); B.book.other += Math.max(0, u.hp); }
  u.alive = false; u.hp = 0; u.anim = 'dead'; u.animT = 0; u.status = {};
  B.emit({ e: 'die', uid: u.uid, x: u.x, z: u.z, expire: true, flee: true });
}

function makeEgg(B, R) {
  const avg = B.heroes.reduce((s, u) => s + u.maxHp, 0) / Math.max(1, B.heroes.length);
  const hp = Math.round(avg * R.hpK);
  return {
    uid: ++B.uidSeq, team: 0, kind: 'egg', x: 0, z: 0, face: 0, r: R.r, alive: true, hp, maxHp: hp, shield: 0, shieldT: 0,
    base: { hp, atk: 0, aspd: 0, speed: 0 }, mods: {}, buffs: [], status: {}, state: {}, attack: null, skills: [], target: 0,
    retargetT: 0, atkT: 0, lockT: 1e9, dotT: 0.5, anim: 'idle', animT: 0, vx: 0, vz: 0,
    egg: true, taunt: R.taunt, def: { name: 'Trứng Mầm', color: 0x9cf0a0 },
  };
}

function modeTick(B, dt) {
  const mode = B.plan.mode; const R = MODES[mode]; const S = B.mapState || (B.mapState = {}); const st = S.mode || (S.mode = { kind: mode, w: 0 });
  const fresh = st.w !== B.wave; st.w = B.wave;
  if (mode === 'defend') {
    if (!st.egg) { st.egg = makeEgg(B, R); B.units.push(st.egg); B.allies.push(st.egg); B.byUid.set(st.egg.uid, st.egg); B.emit({ e: 'egg', uid: st.egg.uid, s: 'in', x: 0, z: 0 }); }
    const egg = st.egg;
    if (!egg.alive) { if (!st.broke) { st.broke = true; B.emit({ e: 'egg', uid: egg.uid, s: 'broke', x: egg.x, z: egg.z }); lose(B, 'egg'); } return; }
    if (fresh && B.wave > 1) { egg.hp = Math.min(egg.maxHp, egg.hp + egg.maxHp * R.heal); B.emit({ e: 'egg', uid: egg.uid, s: 'room', x: 0, z: 0 }); }
    // the egg never moves: knock-backs and the crowd's shoving are undone every tick
    egg.x = 0; egg.z = 0; egg.lockT = 1e9;
    return;
  }
  if (mode === 'survive') {
    if (B.wave >= WAVES) return;
    if (fresh) { st.left = R.time; st.k = 0; st.done = false; st.ten = false; }
    st.left = Math.max(0, R.time - B.waveT);
    if (!st.ten && st.left <= 10) { st.ten = true; B.emit({ e: 'survive_left', left: 10 }); }
    if (st.done) return;
    if (B.waveT >= R.time) {
      st.done = true; B.queue.length = 0; B.spawnsLeft = 0;
      for (const u of B.enemies) if (u.alive && !u.boss) vanish(B, u);
      B.emit({ e: 'survived', wave: B.wave });
      return;
    }
    if (!B.queue.length) {
      const W = B.stage.waves[B.wave - 1]; const gs = W.groups.filter((g) => !g.elite && g.hpK < 1);
      let alive = 0; for (const u of B.enemies) if (u.alive) alive++;
      if (gs.length && alive < R.cap) {
        const g = gs[st.k % gs.length]; st.k++;
        B.queue.push({ ...g, at: B.waveT + 0.6, gate: undefined, ang: g.ang + st.k * 1.7 }); B.spawnsLeft += g.n;
      }
    }
    return;
  }
  if (mode === 'chase') {
    if (B.wave >= WAVES) return;
    if (fresh) { st.uid = 0; st.leg = 0; st.rest = 0; st.out = false; st.down = false; }
    if (st.out || st.down) return;
    let c = st.uid ? B.byUid.get(st.uid) : null;
    if (!st.uid) {
      for (const u of B.enemies) if (u.alive && !u.boss && !u.elite && u.room === B.wave - 1 && (!c || u.uid < c.uid)) c = u;
      if (!c) return;
      const k = R.hpK; B.book.enemyIn += c.maxHp * (k - 1); c.maxHp *= k; c.hp = c.maxHp; c.core = true; c.lockT = 1e9;
      const gs = gatesNow(B); let best = 0; let bd = -1;
      gs.forEach((g, i) => { const d = Math.hypot(g.x - c.x, g.z - c.z); if (d > bd) { bd = d; best = i; } });
      st.uid = c.uid; st.from = best; st.leg = 0;
      B.emit({ e: 'core', uid: c.uid, s: 'run', x: c.x, z: c.z });
    }
    if (!c || !c.alive) { st.down = true; B.emit({ e: 'core', uid: st.uid, s: 'down', x: c ? c.x : 0, z: c ? c.z : 0 }); return; }
    c.lockT = 1e9;
    const gs = gatesNow(B); const route = (j) => { if (!gs.length) { const a = j % 2 ? -0.4 : -Math.PI + 0.4; return { x: Math.cos(a) * 9, z: Math.sin(a) * 4.4 }; } return gs[(st.from + j) % gs.length]; };
    // the next gate, drawn a little inside the rim so it runs over the floor
    const g = route(st.leg); const tx = g.x * 0.92; const tz = g.z * 0.92;
    const dx = tx - c.x; const dz = tz - c.z; const d = Math.hypot(dx, dz);
    st.to = { x: tx, z: tz };
    if (d < 0.5) {
      st.leg++;
      if (st.leg >= R.legs) { st.out = true; c.untargetable = true; B.emit({ e: 'core', uid: c.uid, s: 'out', x: c.x, z: c.z }); lose(B, 'core'); return; }
      st.rest = R.rest; B.emit({ e: 'core', uid: c.uid, s: 'gate', leg: st.leg, x: c.x, z: c.z });
      return;
    }
    if (st.rest > 0) { st.rest -= dt; c.anim = 'idle'; return; }
    if (c.status.stun || c.status.freeze || c.status.root) { c.anim = 'stun'; return; }
    const v = R.speed * (c.status.slow ? 1 - c.status.slow.v : 1) * dt;
    c.x += (dx / d) * Math.min(d, v); c.z += (dz / d) * Math.min(d, v); c.face = Math.atan2(dz, dx); c.anim = 'run';
  }
}

// what the view and the HUD show of the special rule: null, or { kind, title, rule, ... } with the live numbers
export function modeState(B) {
  const mode = B && B.plan && B.plan.mode; if (!mode) return null;
  const R = MODES[mode]; const st = (B.mapState && B.mapState.mode) || {};
  const out = { kind: mode, title: R.title, rule: R.rule, active: B.wave < WAVES || mode === 'defend' };
  if (mode === 'defend' && st.egg) Object.assign(out, { uid: st.egg.uid, x: st.egg.x, z: st.egg.z, hp: st.egg.hp / st.egg.maxHp, alive: st.egg.alive });
  if (mode === 'survive') Object.assign(out, { left: st.left === undefined ? R.time : st.left, time: R.time, done: !!st.done });
  if (mode === 'chase') Object.assign(out, { uid: st.uid || 0, leg: st.leg || 0, legs: R.legs, to: st.to || null, out: !!st.out, down: !!st.down });
  return out;
}
