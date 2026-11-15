// Online lag in numbers: one host page and N guest pages play a real co-op match while the script measures, per role,
// send rates, bytes per second, message sizes, frame time, how long the guest's own input takes to reach its own screen,
// and how smoothly the guest sees everyone else (position error against the host, visible snaps and stalls per second).
//
//   node tools/net-lag.js [scenario,...]          default: lan,wifi,phone
//   scenarios  lan    fakenet, no added delay
//              wifi   fakenet, 120 ms RTT +-40 ms jitter, 2 % loss
//              phone  fakenet, 250 ms RTT +-60 ms jitter, 3 % loss
//              bad    fakenet, 300 ms RTT +-150 ms jitter, 15 % loss (nothing should break)
//              4g     fakenet, the guest on Vietnamese 4G: RTT to the relay 60 to 150 ms, and every 2 to 5 s the link
//                     stalls for 200 to 600 ms and then hands over everything at once. The host is on fibre (30 ms)
//              isp    fakenet, the guest on another ISP with a worse route to the relay: RTT 130 ms +-40, 2 % of
//                     segments retransmitted. The host is on fibre (30 ms)
//              relay  the real Unity Relay, no added delay (use with DTT_BASE on the deployed hub)
//   NL_GUESTS=1,4   guest counts to run per scenario (default 1)      NL_SECS=25   seconds of play measured
//   NL_MODE=tdm|nha NL_TRIALS=20 (input-latency trials per role) NL_TAG=before   -> .chk/net-lag-<tag>.json
//
// The delay, jitter and loss are added here, outside the game: an init script wraps BroadcastChannel (the fakenet
// carrier) and counts WebSocket bytes (the relay carrier), so the same tool measures any build of the game.
// lan, wifi, phone and bad treat every message on its own (late ones overtake, lost ones stay lost), like UDP.
// 4g and isp model what a browser really has to the relay, a WebSocket: one ordered stream per machine, where a late or
// lost segment holds back everything behind it and the backlog then arrives in one burst.
'use strict';
const { launch, open, CHK, fs, path } = require('./lib.js');
const { serve } = require('../../../tools/thumb-lib.js');

// A stream link is one machine's access line to the relay: leg and jit are one way, in ms; a lost segment waits rto ms
// for its retransmit; stall: [every lo, every hi, length lo, length hi] in ms.
const FIBRE = { leg: 15, jit: 3, loss: 0, rto: 0 };
const SCENARIOS = {
  lan: { rtt: 0, jit: 0, loss: 0 }, wifi: { rtt: 120, jit: 40, loss: 2 }, phone: { rtt: 250, jit: 60, loss: 3 }, bad: { rtt: 300, jit: 150, loss: 15 },
  '4g': { rtt: 135, jit: 50, loss: 1, stream: { host: FIBRE, guest: { leg: 52, jit: 22, loss: 1, rto: 250, stall: [2000, 5000, 200, 600] } } },
  isp: { rtt: 160, jit: 46, loss: 2, stream: { host: FIBRE, guest: { leg: 65, jit: 20, loss: 2, rto: 300 } } },
  relay: { real: true, rtt: 0, jit: 0, loss: 0 },
};
const ENV = process['env'];
const SECS = Number(ENV.NL_SECS || 25), MODE = ENV.NL_MODE || 'tdm', TAG = ENV.NL_TAG || 'run';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function netShim(cfg) {
  const nl = (window.__nl = { tx: 0, txN: 0, txMax: 0, rx: 0, rxN: 0, dropped: 0, stalls: [] });
  const sent = (n) => { nl.tx += n; nl.txN++; if (n > nl.txMax) nl.txMax = n; };
  const BC = window.BroadcastChannel;

  // The stream model. Each page owns its access line; up and down are two ordered queues that one stall freezes together.
  let seed = 20261115;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const line = { up: [], down: [], last: { up: 0, down: 0 }, stallEnd: 0, nextStall: 0, timer: 0 };
  const mine = () => { const G = window.__G, role = G && G.online && G.online.role; return cfg.stream && role ? cfg.stream[role === 'host' ? 'host' : 'guest'] : null; };
  function pump() {
    const L = mine(), now = performance.now();
    if (L && L.stall) {
      if (!line.nextStall) line.nextStall = now + L.stall[0] + rnd() * (L.stall[1] - L.stall[0]);
      if (now >= line.nextStall) {
        line.stallEnd = now + L.stall[2] + rnd() * (L.stall[3] - L.stall[2]);
        line.nextStall = line.stallEnd + L.stall[0] + rnd() * (L.stall[1] - L.stall[0]);
        nl.stalls.push([performance.timeOrigin + now, performance.timeOrigin + line.stallEnd]);
      }
    }
    if (now < line.stallEnd) return;
    for (const q of [line.up, line.down]) while (q.length && q[0].t <= now) q.shift().go();
  }
  function carry(dir, L, go) {
    let t = performance.now() + L.leg + (rnd() * 2 - 1) * L.jit;
    if (rnd() * 100 < L.loss) { t += L.rto; nl.dropped++; }
    t = Math.max(t, line.last[dir]);
    line.last[dir] = t;
    line[dir].push({ t, go });
    if (!line.timer) line.timer = setInterval(pump, 2);
  }

  window.BroadcastChannel = class extends BC {
    constructor(name) { super(name); this.__game = String(name).startsWith('dtt-fakenet-'); }
    postMessage(m) {
      if (!this.__game || !m || m.k !== 'msg') return super.postMessage(m);
      sent(m.data.byteLength);
      const L = mine();
      if (L) return carry('up', L, () => { try { super.postMessage(m); } catch (e) { /* channel closed */ } });
      if (cfg.stream) return super.postMessage(m);
      if (Math.random() * 100 < cfg.loss) { nl.dropped++; return; }
      const wait = cfg.rtt / 2 + (Math.random() * 2 - 1) * cfg.jit / 2;
      if (wait <= 0) return super.postMessage(m);
      setTimeout(() => { try { super.postMessage(m); } catch (e) { /* channel closed */ } }, wait);
    }
    get onmessage() { return super.onmessage; }
    set onmessage(fn) {
      super.onmessage = !fn || !this.__game ? fn : (e) => {
        const L = e.data && e.data.k === 'msg' ? mine() : null;
        if (L) carry('down', L, () => fn(e)); else fn(e);
      };
    }
  };
  const WS = window.WebSocket;
  window.WebSocket = class extends WS {
    constructor(...a) { super(...a); this.addEventListener('message', (e) => { nl.rx += (e.data && (e.data.byteLength || e.data.length)) || 0; nl.rxN++; }); }
    send(d) { sent(d.byteLength || d.length || 0); return super.send(d); }
  };
}

// Runs in the page once the match is on. Records what is drawn: every mech's on-screen position after each mechs.sync.
function probe(t0) {
  const G = window.__G, P = (window.__probe = { on: false, frames: [], dts: [], hostCost: [], trial: null, shots: [] });
  const now = () => performance.timeOrigin + performance.now() - t0;
  const views = G.gfx.mechs.views, sync = G.gfx.mechs.sync;
  const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let last = 0;
  G.gfx.mechs.sync = function (m, alpha, dt, time) {
    sync.call(this, m, alpha, dt, time);
    const t = now(), me = views.get(G.me), tr = P.trial;
    if (tr && me) {
      const x = me.root.position.x, z = me.root.position.z, a = me.turret.rotation.y;
      if (tr.rest === null) tr.rest = [x, z, a];
      else if (tr.at) {
        if (tr.move === null && Math.hypot(x - tr.rest[0], z - tr.rest[1]) > 0.03) tr.move = t - tr.at;
        if (tr.aim === null && turn(a, tr.rest[2]) > 0.2) tr.aim = t - tr.at;
        if (tr.shot === null && m.shots.some((s) => s.owner === G.me && !tr.old.has(s.id))) tr.shot = t - tr.at;
      }
    }
    if (!P.on) { last = t; return; }
    P.dts.push(t - last); last = t;
    const row = [t];
    for (const u of m.units) { const v = views.get(u.id), ok = v && v.shown && u.alive; row.push(ok ? v.root.position.x : NaN, ok ? v.root.position.z : NaN); }
    P.frames.push(row);
    for (const s of m.shots) P.shots.push([t, s.id, s.px + (s.x - s.px) * alpha, s.pz + (s.z - s.pz) * alpha, s.speed]);
  };
  if (G.online.role === 'host') {
    const after = G.online.afterStep;
    G.online.afterStep = function (m) { const a = performance.now(); after.call(this, m); if (P.on) P.hostCost.push(performance.now() - a); };
  }
  // One input-latency trial: stand still, then at one instant push the stick and swing the aim, and time both until drawn.
  window.__trial = (mx, mz, swing) => new Promise((resolve) => {
    const u = G.match.units[G.me];
    const idle = { mx: 0, mz: 0, aim: u.aim, fire: false, s1: false, s2: false, ult: false, heal: false, tx: u.x, tz: u.z };
    window.__input(idle);
    setTimeout(() => {
      const tr = (P.trial = { at: 0, rest: null, move: null, aim: null, shot: null, old: new Set(), alive: false });
      const wait = () => {
        if (tr.rest === null) return requestAnimationFrame(wait);
        setTimeout(() => {
          const me = G.match.units[G.me], v = views.get(G.me);
          tr.rest = [v.root.position.x, v.root.position.z, v.turret.rotation.y];
          tr.alive = me.alive && !(me.stunT > 0);
          for (const s of G.match.shots) tr.old.add(s.id);
          tr.at = now();
          window.__input({ ...idle, mx, mz, aim: idle.aim + swing, fire: true });
          setTimeout(() => { P.trial = null; window.__input(idle); resolve({ move: tr.move, aim: tr.aim, shot: tr.shot, alive: tr.alive && G.match.units[G.me].alive }); }, 1200);
        }, 37 + Math.random() * 40);
      };
      wait();
    }, 700);
  });
  window.__probeTake = () => { const o = { frames: P.frames, dts: P.dts, hostCost: P.hostCost, shots: P.shots }; P.frames = []; P.dts = []; P.hostCost = []; P.shots = []; return o; };
}

// A stand-in for a person: walk toward the nearest enemy, aim at it, hold fire, press skills now and then.
const PILOT = `window.__input((m, u) => {
  let best = null, bd = 1e9;
  for (const o of m.units) { if (o.team === u.team || !o.alive) continue; const d = Math.hypot(o.x - u.x, o.z - u.z); if (d < bd) { bd = d; best = o; } }
  if (!best) return { mx: 0, mz: 0, aim: u.aim, fire: false, s1: false, s2: false, ult: false, heal: false, tx: u.x, tz: u.z };
  const a = Math.atan2(best.z - u.z, best.x - u.x), go = bd > 9 ? 1 : bd < 5 ? -1 : 0, t = Math.floor(m.time);
  return { mx: Math.cos(a) * go + Math.sin(m.time) * 0.5, mz: Math.sin(a) * go + Math.cos(m.time) * 0.5, aim: a, fire: bd < 15, s1: t % 9 === 0, s2: t % 11 === 0, ult: t % 23 === 0, heal: u.hp < u.maxHp * 0.5, tx: best.x, tz: best.z };
})`;

const stat = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return { n: 0, avg: NaN, p50: NaN, p95: NaN, max: NaN };
  return { n: s.length, avg: s.reduce((x, y) => x + y, 0) / s.length, p50: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] };
};
const fx = (k) => (v) => (Number.isFinite(v) ? v.toFixed(k) : 'n/a');
const f0 = fx(0), f1 = fx(1), f2 = fx(2);

// Host track: where unit i was drawn at time t, linear between the host's frames.
function lookup(frames, i) {
  let k = 0;
  return (t) => {
    while (k > 0 && frames[k][0] > t) k--;
    while (k < frames.length - 2 && frames[k + 1][0] <= t) k++;
    const a = frames[k], b = frames[k + 1];
    if (!a || !b || t < a[0] || t > b[0]) return null;
    const ax = a[1 + i * 2], bx = b[1 + i * 2];
    if (!Number.isFinite(ax) || !Number.isFinite(bx)) return null;
    const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return [ax + (bx - ax) * f, a[2 + i * 2] + (b[2 + i * 2] - a[2 + i * 2]) * f];
  };
}

// What the guest draws against what the host draws, for the listed units.
//   delay      how far behind the host the guest's picture runs (the shift that fits best)
//   errNow     distance to where the host has the mech at the same instant
//   errLag     distance to the host's path once that delay is taken out: what is left is warping
//   snapsPerSec, stallsPerSec: per second of play, counted over all the listed units together
//   snap       a drawn step at least 12 cm longer than the fastest the mech truly moved within +-120 ms
//   stall      a drawn step of nothing while the mech truly moved faster than 2 m/s throughout
function smooth(host, guest, units) {
  const errAt = (D, keep) => {
    let sum = 0, n = 0;
    for (const i of units) {
      const at = lookup(host, i);
      for (const g of guest) {
        const x = g[1 + i * 2];
        if (!Number.isFinite(x)) continue;
        const h = at(g[0] - D);
        if (!h) continue;
        const e = Math.hypot(x - h[0], g[2 + i * 2] - h[1]);
        sum += e; n++;
        if (keep) keep.push(e);
      }
    }
    return n ? sum / n : Infinity;
  };
  let D = 0, best = Infinity;
  for (let d = -400; d <= 700; d += 10) { const e = errAt(d); if (e < best) { best = e; D = d; } }
  const nowErr = [], lagErr = [];
  errAt(0, nowErr); errAt(D, lagErr);
  let snaps = 0, stalls = 0, secs = 0;
  const jumps = [];
  for (const i of units) {
    const hs = [];
    for (let k = 1; k < host.length; k++) {
      const a = host[k - 1], b = host[k], d = Math.hypot(b[1 + i * 2] - a[1 + i * 2], b[2 + i * 2] - a[2 + i * 2]);
      hs.push([b[0], Number.isFinite(d) ? d / Math.max(1, b[0] - a[0]) * 1000 : NaN]);
    }
    let lo = 0;
    for (let k = 1; k < guest.length; k++) {
      const a = guest[k - 1], b = guest[k], dt = (b[0] - a[0]) / 1000;
      const d = Math.hypot(b[1 + i * 2] - a[1 + i * 2], b[2 + i * 2] - a[2 + i * 2]);
      if (!Number.isFinite(d) || dt <= 0 || dt > 0.1) continue;
      secs += dt;
      const t = b[0] - D;
      while (lo < hs.length && hs[lo][0] < t - 120) lo++;
      let vmax = 0, vmin = Infinity, seen = 0, teleport = false;
      for (let j = lo; j < hs.length && hs[j][0] <= t + 120; j++) {
        const v = hs[j][1];
        if (!Number.isFinite(v) || v > 60) { teleport = true; break; }
        if (v > vmax) vmax = v;
        if (v < vmin) vmin = v;
        seen++;
      }
      if (!seen || teleport) continue;
      if (d - vmax * dt > 0.12) { snaps++; jumps.push([b[0], d - vmax * dt, i]); if (ENV.NL_DEBUG && (snaps <= 12 || d - vmax * dt > 1)) console.log(`  snap unit ${i} t ${Math.round(b[0])} ms: drew ${d.toFixed(2)} m in ${(dt * 1000).toFixed(0)} ms, host top speed nearby ${vmax.toFixed(1)} m/s, from (${a[1 + i * 2].toFixed(2)}, ${a[2 + i * 2].toFixed(2)})`); }
      else if (d < 0.004 && vmin > 2) stalls++;
    }
  }
  const per = units.length ? secs / units.length : 0;
  return { delay: D, errNow: stat(nowErr), errLag: stat(lagErr), snapsPerSec: per ? snaps / per : NaN, stallsPerSec: per ? stalls / per : NaN, snaps, stalls, secs: per, jumps };
}

// What the guest sees in the second and a half after each stall of its line: how many stalls were followed by a jump,
// and the biggest one. A jump's size is how much longer the drawn step was than the mech could truly have moved.
function afterStalls(stalls, t0, from, to, sm) {
  const rows = stalls.map(([a, b]) => [a - t0, b - t0]).filter(([a, b]) => a >= from && b + 1500 <= to);
  let hit = 0, worst = 0, len = 0;
  for (const [a, b] of rows) {
    const mine = sm.jumps.filter((j) => j[0] >= a && j[0] <= b + 1500);
    if (mine.length) hit++;
    for (const j of mine) worst = Math.max(worst, j[1]);
    len += b - a;
  }
  return { stalls: rows.length, avgLen: rows.length ? len / rows.length : NaN, withJump: hit, worstJump: worst, worstAnywhere: sm.jumps.reduce((w, j) => Math.max(w, j[1]), 0) };
}

// Shots: each drawn step should be speed * dt long. A jerk is a step off by more than 60 % and 0.25 m.
function shotJerk(shots) {
  const by = new Map();
  for (const s of shots) { if (!by.has(s[1])) by.set(s[1], []); by.get(s[1]).push(s); }
  let jerks = 0, steps = 0, dev = 0;
  for (const list of by.values()) for (let k = 1; k < list.length; k++) {
    const a = list[k - 1], b = list[k], dt = (b[0] - a[0]) / 1000;
    if (dt <= 0 || dt > 0.1) continue;
    const want = b[4] * dt, got = Math.hypot(b[2] - a[2], b[3] - a[3]);
    steps++; dev += Math.abs(got - want) / want;
    if (Math.abs(got - want) > Math.max(0.25, want * 0.6)) jerks++;
  }
  return { steps, jerkPct: steps ? jerks / steps * 100 : NaN, devPct: steps ? dev / steps * 100 : NaN };
}

async function until(page, expr, ms, label) {
  try { await page.waitForFunction(expr, null, { timeout: ms, polling: 100 }); return true; } catch (e) { console.log('TIMEOUT ' + label); return false; }
}

async function run(br, base, name, guests) {
  const sc = SCENARIOS[name];
  const query = (sc.real ? '' : 'fakenet=1&') + 'noaudio&q=low';
  const opts = { viewport: { width: 960, height: 540 }, init: { fn: netShim, arg: { rtt: sc.rtt, jit: sc.jit, loss: sc.loss, stream: sc.stream || null } } };
  const S = [];
  for (let i = 0; i <= guests; i++) S.push(await open(br, base, query, sc.real || !i ? opts : { ...opts, ctx: S[0].ctx }));
  const H = S[0].page, Gs = S.slice(1).map((s) => s.page), all = [H, ...Gs];
  try {
    await H.evaluate(() => { window.__G.online.host({ name: 'net-lag ' + Date.now().toString(36), isPrivate: true, playerName: 'Chủ' }); });
    if (!await until(H, `__G.online.state === 'lobby' && !!__G.online.code`, 40000, 'host lobby')) return null;
    const code = await H.evaluate('__G.online.code');
    const region = await H.evaluate('__G.online.region || ""');
    for (const [i, g] of Gs.entries()) {
      await g.evaluate(({ code, i }) => { window.__G.online.join({ code, playerName: 'Khách ' + (i + 1) }); }, { code, i });
      if (!await until(g, `__G.online.state === 'lobby'`, 40000, 'guest lobby')) return null;
    }
    await until(H, `__G.online.lobby.players.length === ${guests + 1}`, 20000, 'players');
    await H.evaluate((mode) => window.__G.online.setRoom({ map: mode === 'nha' ? 'luythep' : 'denrung', mode, diff: 'normal' }), MODE);
    const picks = ['soi', 'hac', 'ung', 'loi'];
    for (const [i, g] of Gs.entries()) await g.evaluate((mech) => window.__G.online.setMine({ mech, ready: true }), picks[i % 4]);
    await until(H, `__G.online.lobby.players.every((p) => p.ready)`, 20000, 'ready');
    await H.evaluate('__G.online.start()');
    for (const p of all) if (!await until(p, `__G.mode === 'match' && __G.match && __G.match.units.length >= 6`, 40000, 'match')) return null;
    const t0 = Date.now();
    for (const p of all) await p.evaluate(probe, t0);
    await H.evaluate(PILOT);
    for (const g of Gs.slice(1)) await g.evaluate(PILOT);
    const A = Gs[0], slot = await A.evaluate('__G.me');
    await sleep(2500);

    const eight = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]];
    const dirs = Array.from({ length: Number(ENV.NL_TRIALS || 20) }, (_, i) => eight[i % 8]);
    const lat = { guest: [], host: [] };
    for (const [role, page] of [['guest', A], ['host', H]]) {
      for (const d of dirs) { const r = await page.evaluate(([mx, mz]) => window.__trial(mx, mz, 1.6), d); if (r.alive) lat[role].push(r); }
      await page.evaluate(PILOT);
    }
    await sleep(1500);

    const mark = (p) => p.evaluate(() => ({ nl: { ...window.__nl }, st: { ...window.__G.online.stats }, t: performance.now() }));
    for (const p of all) await p.evaluate(() => { window.__probeTake(); window.__probe.on = true; });
    const m0 = [await mark(H), await mark(A)];
    await sleep(SECS * 1000);
    const m1 = [await mark(H), await mark(A)];
    for (const p of all) await p.evaluate(() => { window.__probe.on = false; });
    const dh = await H.evaluate(() => window.__probeTake()), dg = await A.evaluate(() => window.__probeTake());
    const stalls = await A.evaluate(() => window.__nl.stalls);
    const netStats = await A.evaluate(() => (window.__G.online.netStats ? window.__G.online.netStats() : null));
    const errors = [];
    for (const [i, s] of S.entries()) for (const x of [...await s.page.evaluate('window.__errors'), ...s.problems]) errors.push((i ? 'guest' : 'host') + ': ' + String(x).slice(0, 200));

    const n = dh.frames[0] ? (dh.frames[0].length - 1) / 2 : 0;
    const others = [...Array(n).keys()].filter((i) => i !== slot);
    const remote = smooth(dh.frames, dg.frames, others), own = smooth(dh.frames, dg.frames, [slot]);
    const span = dg.frames.length ? [dg.frames[0][0], dg.frames[dg.frames.length - 1][0]] : [0, 0];
    const secH = (m1[0].t - m0[0].t) / 1000, secG = (m1[1].t - m0[1].t) / 1000;
    const d = (a, b, k) => b.nl[k] - a.nl[k], ds = (a, b, k) => (b.st[k] || 0) - (a.st[k] || 0);
    return {
      scenario: name, guests, mode: MODE, secs: SECS, net: sc, region,
      host: {
        frame: stat(dh.dts), netCost: stat(dh.hostCost), snapsPerSec: ds(m0[0], m1[0], 'snapsSent') / secH / guests,
        txBytesPerSecPerGuest: d(m0[0], m1[0], 'tx') / secH / guests, datagramsPerSec: d(m0[0], m1[0], 'txN') / secH, maxDatagram: m1[0].nl.txMax,
        bytesPerSnap: d(m0[0], m1[0], 'tx') / Math.max(1, ds(m0[0], m1[0], 'snapsSent')),
        inputLatency: { move: stat(lat.host.map((r) => r.move)), aim: stat(lat.host.map((r) => r.aim)), shot: stat(lat.host.map((r) => r.shot)) }, shots: shotJerk(dh.shots),
      },
      guest: {
        frame: stat(dg.dts), snapsRecvPerSec: ds(m0[1], m1[1], 'snapsRecv') / secG, inputsPerSec: ds(m0[1], m1[1], 'inputsSent') / secG,
        txBytesPerSec: d(m0[1], m1[1], 'tx') / secG, bytesPerInput: d(m0[1], m1[1], 'tx') / Math.max(1, ds(m0[1], m1[1], 'inputsSent')),
        inputLatency: { move: stat(lat.guest.map((r) => r.move)), aim: stat(lat.guest.map((r) => r.aim)), shot: stat(lat.guest.map((r) => r.shot)) },
        remote, own, shots: shotJerk(dg.shots),
        afterStalls: { remote: afterStalls(stalls, t0, span[0], span[1], remote), own: afterStalls(stalls, t0, span[0], span[1], own) },
        readout: netStats,
      },
      errors,
    };
  } finally { for (const s of S.reverse()) await s.close().catch(() => {}); }
}

function print(r) {
  const h = r.host, g = r.guest;
  console.log(`\n== ${r.scenario} (RTT ${r.net.rtt} ms +-${r.net.jit}, loss ${r.net.loss} %), ${r.guests} guest(s), mode ${r.mode}, ${r.secs} s${r.region ? ', relay region ' + r.region : ''} ==`);
  console.log(`host   frame ${f1(h.frame.avg)} ms avg, p95 ${f1(h.frame.p95)}, max ${f1(h.frame.max)} | net work per tick ${f2(h.netCost.avg)} ms avg, max ${f1(h.netCost.max)}`);
  console.log(`host   sends ${f1(h.snapsPerSec)} snapshots/s per guest, ${f0(h.bytesPerSnap)} B per snapshot, ${f0(h.txBytesPerSecPerGuest)} B/s per guest (${f1(h.txBytesPerSecPerGuest * 8 / 1000)} kbit/s), biggest datagram ${h.maxDatagram} B`);
  console.log(`guest  sends ${f1(g.inputsPerSec)} inputs/s, ${f0(g.bytesPerInput)} B each, ${f0(g.txBytesPerSec)} B/s | receives ${f1(g.snapsRecvPerSec)} snapshots/s | frame ${f1(g.frame.avg)} ms avg, p95 ${f1(g.frame.p95)}`);
  console.log(`input  own move on screen after: guest ${f0(g.inputLatency.move.avg)} ms avg (p95 ${f0(g.inputLatency.move.p95)}, n ${g.inputLatency.move.n}), host ${f0(h.inputLatency.move.avg)} ms (n ${h.inputLatency.move.n}) | own aim: guest ${f0(g.inputLatency.aim.avg)} ms (p95 ${f0(g.inputLatency.aim.p95)}), host ${f0(h.inputLatency.aim.avg)} ms`);
  console.log(`remote mechs on guest: shown ${g.remote.delay} ms behind host | error vs host now ${f2(g.remote.errNow.avg)} m avg, p95 ${f2(g.remote.errNow.p95)} | path error ${f2(g.remote.errLag.avg)} m avg, p95 ${f2(g.remote.errLag.p95)} | snaps ${f2(g.remote.snapsPerSec)}/s, stalls ${f2(g.remote.stallsPerSec)}/s (all of them together)`);
  console.log(`own mech on guest:     shown ${g.own.delay < 0 ? -g.own.delay + ' ms ahead of' : g.own.delay + ' ms behind'} host | error vs host now ${f2(g.own.errNow.avg)} m avg, p95 ${f2(g.own.errNow.p95)} | snaps ${f2(g.own.snapsPerSec)}/s, stalls ${f2(g.own.stallsPerSec)}/s`);
  const as = g.afterStalls;
  console.log(`own shot on screen after pressing fire: guest ${f0(g.inputLatency.shot.avg)} ms avg (p95 ${f0(g.inputLatency.shot.p95)}, n ${g.inputLatency.shot.n}), host ${f0(h.inputLatency.shot.avg)} ms (n ${h.inputLatency.shot.n})`);
  console.log(`biggest jump drawn: remote mechs ${f2(as.remote.worstAnywhere)} m, own mech ${f2(as.own.worstAnywhere)} m`);
  if (as.remote.stalls) console.log(`after a stall of the guest's line (${as.remote.stalls} stalls, ${f0(as.remote.avgLen)} ms on average): remote mechs jumped after ${as.remote.withJump} of them, biggest ${f2(as.remote.worstJump)} m | own mech jumped after ${as.own.withJump}, biggest ${f2(as.own.worstJump)} m`);
  if (g.readout) console.log('readout ' + JSON.stringify(g.readout));
  console.log(`shots  guest: ${g.shots.steps} drawn steps, ${f1(g.shots.jerkPct)} % jerky, mean step error ${f1(g.shots.devPct)} % | host: ${f1(h.shots.jerkPct)} % jerky, ${f1(h.shots.devPct)} %`);
  if (r.errors.length) console.log('ERRORS ' + r.errors.slice(0, 4).join(' | '));
}

(async () => {
  const names = (process.argv[2] || 'lan,wifi,phone').split(',').filter((n) => SCENARIOS[n]);
  const counts = (ENV.NL_GUESTS || '1').split(',').map(Number);
  const srv = ENV.DTT_BASE ? { base: ENV.DTT_BASE, close() {} } : await serve();
  const br = await launch();
  const out = [];
  try {
    for (const name of names) for (const g of counts) {
      const r = await run(br, srv.base, name, g);
      if (!r) { console.log(`\n== ${name}, ${g} guest(s): did not reach a match ==`); continue; }
      print(r); out.push(r);
    }
  } finally { await br.close().catch(() => {}); srv.close(); }
  fs.mkdirSync(CHK, { recursive: true });
  const file = path.join(CHK, `net-lag-${TAG}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('\nsaved ' + file);
  process.exit(out.length ? 0 : 1);
})().catch((e) => { console.log('CRASH ' + (e && e.stack ? e.stack : e)); process.exit(1); });
