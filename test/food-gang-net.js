#!/usr/bin/env node
/* Food Gang online (games/food-gang/js/net): host-authoritative matches over Unity Relay.
 *   Part A (node, loopback BroadcastChannel transport): codec round trip; private 2p and 4p; quick match 2p filled with
 *     2 bots; a client that goes silent becomes a bot and the match goes on; 80 +- 60 ms one-way delay with 10 % of
 *     INPUT/SNAP dropped; the host leaving mid-match ends it as a draw on the clients. Every match: the client's last snapshot has the host's scores / hp at the end, and inputs the
 *     client sends move its agent on the host.
 *   Part B (headless Chromium pages on a local static server, net.html, real Unity Lobby + Relay): the same scenarios.
 *     FG_NET=loop runs part B on the BroadcastChannel loopback instead (no UGS).
 *   node test/food-gang-net.js              both parts
 *   node test/food-gang-net.js --node       part A only;  --browser  part B only;  --only private2,quick (scenario names)
 *   FG_URL=https://.../games/food-gang/net.html  part B against Pages
 *   B/hidden: the host tab is hidden for 6 s mid-match (emulated, see hiddenTabEmulation); FG_DRIVER=0 runs it without
 *     the hidden-tab driver to show the freeze
 * Prints bandwidth per client (bytes on the relay incl. its 38-byte header) and input latency:
 *   inputAck     client samples a frame -> the snapshot saying the host consumed it arrives
 *   inputVisible client samples a frame -> the client renders the tick that contains it (adds the ~100 ms playback delay)
 *   moveSeen     a direction change on the client -> the host's agent velocity flips (one clock in part A)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'food-gang');
const SHOTS = path.join(ROOT, 'shots', 'food-gang', 'net');
const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const want = (n) => !ONLY || ONLY.includes(n);
const PART_A = !argv.includes('--browser');
const PART_B = !argv.includes('--node');
const SHORT = Number(process.env.FG_SHORT || 25);
const HARD_LIMIT = setTimeout(() => { console.log('FAIL hard time limit (24 min) reached'); process.exit(2); }, 24 * 60e3);

let pass = 0, fail = 0;
const fails = [];
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (ok) pass++; else { fail++; fails.push(name + (detail ? ` (${detail})` : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(step);
  }
}
const imp = (rel) => import(pathToFileURL(path.join(GAME, rel)).href);
const report = [];

// ------------------------------------------------------------------------------------------------ part A (node)

async function partA() {
  console.log('\n== part A: node, loopback transport');
  const sim = await imp('js/sim/index.js');
  const metaM = await imp('js/meta/index.js');
  const codec = await imp('js/net/codec.js');
  const { Online } = await imp('js/net/online.js');
  const { loopBackend, ugsBackend } = await imp('js/net/transport.js');
  // FG_A_NET=ugs: the node players talk through the real Unity Lobby + Relay (one anonymous UGS player each)
  const UGS = process.env.FG_A_NET === 'ugs';
  const REGION = process.env.FG_REGION || 'asia-southeast1';
  const { DevPlayer, ScriptedInput } = await imp('js/net/devplayer.js');
  const db = sim.GameDb.load(fs.readFileSync(path.join(GAME, 'data', 'simdata.json'), 'utf8'));
  const meta = new metaM.MetaService(metaM.MetaDb.load(fs.readFileSync(path.join(GAME, 'data', 'metadata.json'), 'utf8')));

  // codec: a bot match captured every 2 ticks, full and delta encodings decode to the same vectors
  {
    const m = new sim.Match(db);
    const setup = sim.createMatchSetup({ seed: 5, mapIndex: 1, goal: 0, teams: 2 });
    for (let s = 0; s < 4; s++) sim.addSlot(setup, s, 1 + s * 3, 12, true, 0.8);
    const st = m.create(setup);
    const bases = new Map();
    let prev = null, ok = true, fullB = 0, deltaB = 0, n = 0, evSeq = 0, evOk = true;
    for (let t = 0; t < 1800; t++) {
      m.step(st, []);
      const ev = m.drainEvents().map((e) => ({ seq: ++evSeq, e }));
      if (st.tick % 2) continue;
      const cap = codec.capture(st);
      const seq = st.tick / 2;
      const full = codec.encodeSnapshot({ seq, baseSeq: 0, ackInput: 0, echo: 0, hold: 0 }, cap, null, ev);
      const delta = prev ? codec.encodeSnapshot({ seq, baseSeq: seq - 1, ackInput: 0, echo: 0, hold: 0 }, cap, prev, ev) : full;
      const d1 = codec.decodeSnapshot(full.bytes, () => null);
      const d2 = codec.decodeSnapshot(delta.bytes, (s) => bases.get(s));
      const same = (a, b) => JSON.stringify([a.g, a.a, [...a.b]]) === JSON.stringify([b.g, b.a, [...b.b]]);
      if (!same(d1.snap, cap) || !same(d2.snap, cap)) ok = false;
      for (let i = 0; i < d2.events.length; i++) {
        const a = d2.events[i].e, b = ev[i].e;
        if (a.type !== b.type || a.tick !== b.tick || a.agent !== b.agent || a.other !== b.other || a.bullet !== b.bullet || a.int !== b.int
          || Math.fround(a.value) !== Math.fround(b.value) || a.flag !== b.flag || Math.abs(a.pos.x - b.pos.x) > 0.003) evOk = false;
      }
      if (d2.events.length !== ev.length) evOk = false;
      bases.set(seq, d2.snap);
      fullB += full.bytes.length; deltaB += delta.bytes.length; n++;
      prev = cap;
    }
    check('codec: full and delta snapshots decode to the captured state (900 snapshots, 4 bots)', ok);
    check('codec: sim events survive the wire', evOk);
    report.push(`snapshot size, 4 bots 2v2: full ${(fullB / n).toFixed(0)} B, delta ${(deltaB / n).toFixed(0)} B (incl. events)`);
    check('delta snapshots are smaller than full ones', deltaB < fullB * 0.8, `${(fullB / n).toFixed(0)} -> ${(deltaB / n).toFixed(0)} B`);
  }

  let chan = 0;
  const profile = (name, skin = 1, level = 3) => {
    const p = meta.newProfile(new Date(), new metaM.MetaRng(7));
    p.name = name;
    if (!p.skins.some((s) => s.id === skin)) p.skins.push(metaM.newSkinProgress(skin, level));
    p.skins.find((s) => s.id === skin).level = level;
    p.skinSelected = skin;
    return p;
  };
  const player = (o) => new DevPlayer({ db, short: SHORT, autoReady: true, input: new ScriptedInput(o.seed || 1),
    backend: UGS ? ugsBackend({ region: REGION }) : null, ...o }).begin();

  async function runMatch(name, { humans, quick = false, impair = null, crash = false, hostLeaves = false }) {
    console.log(`-- A/${name}${UGS ? ' (Unity Relay)' : ''}`);
    Online.configure({ backend: loopBackend(`t${++chan}`), meta, impair, ownLead: process.env.FG_OWN_LEAD !== '0' });
    const ps = [];
    if (quick) {
      const req = (p) => { const r = meta.buildMatchRequest(p, new Date(), new metaM.MetaRng(11)); return r.request; };
      for (let i = 0; i < humans; i++) {
        const p = profile(`Q${i}`, 1 + i * 4, 4);
        ps.push(player({ profile: p, act: 'quick', request: req(p), seed: 3 + i }));
        await sleep(1200);
      }
    } else {
      const host = player({ profile: profile('Host', 1, 5), act: 'create', config: { modeIndex: 1, mapIndex: 0, difficultyInt: 50 }, seed: 2, readyWhen: humans });
      ps.push(host);
      const code = await until(() => host.lobby && host.lobby.code, 15000);
      if (!code) console.log(host.log.join('\n'));
      check(`${name}: private room has a code`, !!code, code);
      for (let i = 1; i < humans; i++) ps.push(player({ profile: profile(`P${i}`, 2 + i * 3, 7), act: 'join', code, seed: 10 + i }));
    }
    const started = await until(() => ps.every((p) => p.runner), 25000);
    check(`${name}: every player got 'start'`, !!started, ps.map((p) => p.role).join(','));
    if (!started) { for (const p of ps) { p.stop(); p.session.leave(); } console.log(ps.map((p) => p.log.join('\n')).join('\n--\n')); return; }
    const host = ps.find((p) => p.role === 'host');
    const clients = ps.filter((p) => p.role === 'client');
    check(`${name}: one host, ${humans - 1} clients`, !!host && clients.length === humans - 1);
    if (!host || clients.length !== humans - 1) { for (const p of ps) { p.stop(); p.session.leave(); } console.log(ps.map((p) => p.log.join('\n')).join('\n--\n')); return; }
    const hs = host.runner.state;
    const humanSlots = hs.agents.filter((a) => !a.isBot).map((a) => a.slot);
    check(`${name}: ${humans} human agents, ${4 - humans} bots`, humanSlots.length === humans, `humans in slots ${humanSlots}`);
    // client input moves its agent on the host; measured on one clock
    await until(() => host.startedAt && clients.every((c) => c.startedAt), 8000);
    await sleep(800);
    const c0 = clients[0];
    const slot = c0.runner.localSlot;
    const hostAgent = () => host.runner.state.agents.find((a) => a.slot === slot);
    const clientAgent = () => c0.runner.state.agents.find((a) => a.slot === slot);
    const moves = [];
    for (const dir of [1, -1, 1, -1]) {
      const x0 = hostAgent().pos.x;
      const t0 = performance.now();
      c0.input.fixed = { dirX: dir, down: 0 };
      const seen = await until(() => (Math.sign(hostAgent().directionX) === dir ? performance.now() : 0), 3000, 2);
      const seenC = await until(() => (Math.sign(clientAgent().directionX) === dir ? performance.now() : 0), 3000, 2);
      await sleep(600);
      moves.push({ dir, dx: hostAgent().pos.x - x0, host: seen ? seen - t0 : null, client: seenC ? seenC - t0 : null, dead: sim.isDead(hostAgent()) });
    }
    c0.input.fixed = null;
    const okMoves = moves.filter((m) => m.host !== null);
    check(`${name}: client direction reaches its agent on the host`, okMoves.length >= 3, moves.map((m) => `${m.dir > 0 ? '+' : '-'}${m.host === null ? 'x' : Math.round(m.host)}ms dx${m.dx.toFixed(1)}`).join(' '));
    check(`${name}: the agent moves the way the client pushes`, moves.filter((m) => !m.dead && Math.sign(m.dx) === m.dir).length >= 2);
    const med = (a) => { const s = a.filter((x) => x !== null).sort((x, y) => x - y); return s.length ? Math.round(s[s.length >> 1]) : null; };
    report.push(`A/${name}: moveSeen host ${med(moves.map((m) => m.host))} ms, client sees own agent turn ${med(moves.map((m) => m.client))} ms`);

    if (crash) {
      const victim = clients[clients.length - 1];
      const vslot = victim.runner.localSlot;
      victim.session.role.dispose();
      victim.session.role.link.send = () => {};
      victim.stop();
      const t0 = performance.now();
      const bot = await until(() => host.runner.state.agents.find((a) => a.slot === vslot).isBot, 8000, 50);
      check(`${name}: silent client's agent becomes a bot on the host`, !!bot, bot ? `${((performance.now() - t0) / 1000).toFixed(1)} s` : '');
      const tick0 = host.runner.state.tick;
      await sleep(1500);
      check(`${name}: match goes on after the drop`, host.runner.state.tick > tick0 + 60);
      const other = clients.filter((c) => c !== victim);
      if (other.length) check(`${name}: other clients see the bot`, !!(await until(() => other.every((c) => c.runner.state.agents.find((a) => a.slot === vslot).isBot), 3000)));
    }

    if (hostLeaves) {
      // the host closes its tab mid-match: clients end the match as a draw on their last picture and get 'closed'
      host.stop();
      host.session.leave();
      const gone = await until(() => clients.every((c) => c.ended && c.closed === 'host-left'), 8000, 50);
      check(`${name}: clients end the match when the host leaves`, !!gone, clients.map((c) => `${c.ended}/${c.closed}`).join(' '));
      check(`${name}: and show it as a draw`, clients.every((c) => c.runner.state.phase === 2 && c.runner.state.winnerTeam === 0));
      for (const p of ps) { p.stop(); p.session.leave(); }
      await sleep(300);
      return;
    }

    const live = ps.filter((p) => !crash || p !== clients[clients.length - 1]);
    const over = await until(() => live.every((p) => p.ended), (SHORT + 20) * 1000, 200);
    check(`${name}: match ends on every page`, !!over, live.map((p) => `${p.role}:${p.ended}`).join(' '));
    await sleep(800);
    const H = host.runner.state;
    for (const c of live.filter((p) => p.role === 'client')) {
      const last = c.runner.net.buffer[c.runner.net.buffer.length - 1].state;
      const same = JSON.stringify(last.killSlot) === JSON.stringify(H.killSlot) && JSON.stringify(last.deathSlot) === JSON.stringify(H.deathSlot)
        && last.winnerTeam === H.winnerTeam && last.phase === H.phase
        && last.agents.every((a, i) => Math.abs(a.hpCurrent - H.agents[i].hpCurrent) < 0.07);
      check(`${name}: client slot ${c.runner.localSlot} ends with the host's scores and hp`, same,
        `host k${H.killSlot} d${H.deathSlot} w${H.winnerTeam} hp ${H.agents.map((a) => Math.round(a.hpCurrent))} | client k${last.killSlot} d${last.deathSlot} hp ${last.agents.map((a) => Math.round(a.hpCurrent))}`);
      const s = c.runner.net.summary();
      // the host keeps stepping after GAME OVER (bullets still expire and raise events), so compare against what the
      // host had produced by the tick of the client's newest snapshot, not against a count that is still moving
      const lastTick = c.runner.net.buffer[c.runner.net.buffer.length - 1].tick;
      check(`${name}: client slot ${c.runner.localSlot} has every sim event up to its newest snapshot (tick ${lastTick})`,
        c.runner.net.lastEvent === host.net.net.eventsThrough(lastTick), `${c.runner.net.lastEvent}/${host.net.net.eventsThrough(lastTick)}, dup ${s.dupEvents}`);
      report.push(`A/${name} client slot ${c.runner.localSlot}: down ${s.downBps} B/s, up ${s.upBps} B/s, snaps ${s.snaps} (full ${s.full}), rtt p50 ${s.rtt.p50} ms, inputAck p50/p95 ${s.inputAck.p50}/${s.inputAck.p95} ms, inputVisible p50/p95 ${s.inputVisible.p50}/${s.inputVisible.p95} ms, playback delay ${s.delayMs} ms, hold ${s.holdPct}%`);
    }
    const hst = host.net.net.stats;
    report.push(`A/${name} host: ${hst.snaps} snapshots, full avg ${hst.full ? Math.round(hst.fullBytes / hst.full) : 0} B, delta avg ${hst.deltas ? Math.round(hst.deltaBytes / hst.deltas) : 0} B; inputs ${JSON.stringify(host.net.net.clientStats().map((c) => c.input))}`);
    // teardown like the game: the match screen goes (no more steps), the host leaves; it must not say bye before
    // every client acked the last events
    host.stop();
    const E = host.net.net.eventSeq;
    host.session.leave();
    const liveClients = live.filter((p) => p.role === 'client');
    const gone = await until(() => liveClients.every((c) => c.closed), 10000, 50);
    check(`${name}: after the host leaves, every client holds all ${E} host events, then sees the host go`, !!gone && liveClients.every((c) => c.runner.net.lastEvent === E),
      liveClients.map((c) => `${c.runner.net.lastEvent} ${c.closed}`).join(', ') + (host.session.linger ? `; host lingered ${host.session.linger.ms} ms for ${host.session.linger.behind} client(s), ${host.session.linger.left} left behind` : '; nothing to linger for'));
    for (const p of ps) { p.stop(); p.session.leave(); }
    await sleep(300);
  }

  if (want('private2')) await runMatch('private2', { humans: 2 });
  // GameOver.ContinueFriendRoom: after a party match both pages are in the same room's lobby again; the guest is ready
  // once its lobby screen is open, the host's Battle! starts the second match on the same relay link
  if (want('rematch')) {
    console.log('-- A/rematch');
    Online.configure({ backend: loopBackend(`t${++chan}`), meta, impair: null, ownLead: true });
    const host = player({ profile: profile('Host', 1, 5), act: 'create', config: { modeIndex: 1, mapIndex: 0, difficultyInt: 50 }, seed: 2, readyWhen: 2 });
    const code = await until(() => host.lobby && host.lobby.code, 15000);
    const guest = player({ profile: profile('P1', 5, 7), act: 'join', code, seed: 11 });
    const ps = [host, guest];
    const starts = [0, 0];
    ps.forEach((p, i) => p.session.on('start', () => { starts[i]++; }));
    const over1 = await until(() => ps.every((p) => p.ended), (SHORT + 30) * 1000, 200);
    check('rematch: first party match ends on both pages', !!over1 && starts.every((n) => n === 1), `starts ${starts}`);
    for (const p of ps) { p.stop(); p.ended = false; }
    await sleep(500);
    const back = ps.map((p) => p.session.backToLobby());
    check('rematch: both sessions go back to the lobby of the same room', back.every(Boolean) && ps.every((p) => p.session.state === 'lobby' && p.session.code === code),
      ps.map((p) => `${p.session.state} ${p.session.code}`).join(', '));
    guest.session.setReady(true);
    await sleep(300);
    check('rematch: the host does not start again until Battle! is pressed', starts.every((n) => n === 1), `starts ${starts}`);
    // the guest changes fighter in the lobby: the roster and the next match carry it
    guest.profile.skinSelected = 9;
    if (!guest.profile.skins.some((s) => s.id === 9)) guest.profile.skins.push(metaM.newSkinProgress(9, 7));
    guest.session.setProfile(guest.profile);
    const picked = await until(() => host.session.players.find((p) => p.name === 'P1' && p.skin === 9), 3000);
    check('rematch: fighter picked in the lobby reaches the host roster', !!picked, JSON.stringify(host.session.players.map((p) => [p.name, p.skin])));
    host.session.setReady(true);
    const again = await until(() => starts.every((n) => n === 2) && ps.every((p) => p.runner && p.request), 10000);
    check('rematch: second match starts on both pages', !!again, `starts ${starts}`);
    const gslot = guest.request && guest.request.localSlot;
    check('rematch: the guest plays its new fighter', !!again && host.request.slots[gslot] && host.request.slots[gslot].skinId === 9, host.request ? JSON.stringify(host.request.slots.map((s) => s && s.skinId)) : '');
    for (const p of ps) { p.stop(); p.session.leave(); }
    await sleep(300);
  }
  if (want('private4')) await runMatch('private4', { humans: 4 });
  if (want('quick')) await runMatch('quick', { humans: 2, quick: true });
  if (want('disconnect')) await runMatch('disconnect', { humans: 3, crash: true });
  if (want('jitter')) await runMatch('jitter', { humans: 2, impair: { delay: 80, jitter: 120, drop: 0.1 } });
  if (want('hostleave')) await runMatch('hostleave', { humans: 2, hostLeaves: true });
  Online.configure({ impair: null });
}

// ------------------------------------------------------------------------------------------------ part B (browsers)

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css', '.otf': 'font/otf', '.ttf': 'font/ttf' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

// Chrome's treatment of a background tab, emulated in the page because headless Chromium never hides a page (tried:
// a second tab in front, CDP minimize, Emulation focus): document.hidden, no requestAnimationFrame, main-thread timers
// at most once a second. Worker timers and worker messages are left alone, as in Chrome.
function hiddenTabEmulation() {
  let hidden = false;
  const raf = window.requestAnimationFrame.bind(window);
  const queued = [];
  window.requestAnimationFrame = (cb) => { if (!hidden) return raf(cb); queued.push(cb); return 0; };
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => st(fn, hidden ? Math.max(ms, 1000) : ms, ...a);
  window.setInterval = (fn, ms = 0, ...a) => {
    let last = 0;
    return si((...b) => {
      if (hidden) { const t = performance.now(); if (t - last < 1000) return; last = t; }
      if (typeof fn === 'function') fn(...b);
    }, ms, ...a);
  };
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  window.__fgHide = (h) => {
    hidden = !!h;
    document.dispatchEvent(new Event('visibilitychange'));
    if (!hidden) for (const cb of queued.splice(0)) raf(cb);
  };
}

async function partB() {
  const LOOP = process.env.FG_NET === 'loop';
  console.log(`\n== part B: headless Chromium, ${LOOP ? 'BroadcastChannel loopback' : 'Unity Lobby + Relay'}`);
  const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
  const { chromium } = require(PW);
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = process.env.FG_URL ? null : await serve();
  const URL0 = process.env.FG_URL || `http://localhost:${server.address().port}/games/food-gang/net.html`;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const shared = LOOP ? await browser.newContext() : null;
  if (shared) await shared.addInitScript(hiddenTabEmulation);
  const errors = [];
  const region = process.env.FG_REGION || 'asia-southeast1';
  async function open(name, params, vp = { width: 960, height: 540 }) {
    let ctx = shared;
    if (!ctx) { ctx = await browser.newContext(); await ctx.addInitScript(hiddenTabEmulation); }
    const page = await ctx.newPage({ viewport: vp });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    // Chrome logs every 4xx fetch as "Failed to load resource" without the URL, so judge the response instead.
    // Updating (lock/unlist), leaving or deleting a Lobby that is already gone answers 404; online.js swallows those on
    // purpose, so they are not page errors. A 404 on join or create still is.
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`${name}: ${m.text()}`); });
    page.on('response', (r) => {
      if (r.status() < 400) return;
      const m = r.request().method();
      const gone = r.status() === 404 && /lobby\.services\.api\.unity\.com\/v1\/(?!create$|query$|joinbycode$|quickjoin$)[^/]+(\/players\/[^/]+)?$/.test(r.url()) && (m === 'POST' || m === 'DELETE');
      if (!gone) errors.push(`${name}: ${r.status()} ${r.request().method()} ${r.url()}`);
    });
    const q = new URLSearchParams({ name, region, short: String(SHORT), ...params });
    if (LOOP) q.set('net', 'loop');
    await page.goto(`${URL0}?${q}`);
    page.fg = name;
    page.ctx = shared ? null : ctx;
    return page;
  }
  const info = (p) => p.evaluate(() => window.fgNet && window.fgNet.info()).catch(() => null);
  const close = async (pages) => { for (const p of pages) { await p.evaluate(() => window.fgNet && window.fgNet.leave()).catch(() => {}); await p.close().catch(() => {}); if (p.ctx) await p.ctx.close().catch(() => {}); } };

  async function scenario(name, { humans, quick = false, game = false, impair = null, crash = false, hide = false, params = {} }) {
    console.log(`-- B/${name}`);
    const errs0 = errors.length;
    const pages = [];
    const extra = { bot: '1', ...(game ? { render: 'game' } : {}), ...(impair || {}), ...params };
    try {
      if (quick) {
        for (let i = 0; i < humans; i++) { pages.push(await open(`Q${i}`, { act: 'quick', level: '4', skin: String(1 + i * 5), mode: '1', ...extra })); await sleep(1500); }
      } else {
        const host = await open('Host', { act: 'create', mode: '1', map: '1', players: String(humans), ...extra }, game ? { width: 1280, height: 720 } : undefined);
        pages.push(host);
        const code = await until(async () => { const i = await info(host); return i && i.lobby && i.lobby.code; }, 20000, 250);
        check(`B/${name}: room code from Unity Lobby`, !!code, code || JSON.stringify((await info(host) || {}).log));
        if (!code) return;
        for (let i = 1; i < humans; i++) pages.push(await open(`P${i}`, { act: 'join', code, skin: String(3 + i * 4), players: String(humans), ...extra }, game ? { width: 1280, height: 720 } : undefined));
      }
      const roles = await until(async () => { const r = await Promise.all(pages.map(info)); return r.every((x) => x && x.role && x.agents) ? r : null; }, 40000, 300);
      check(`B/${name}: every page started the match`, !!roles, roles ? roles.map((r) => r.role).join(',') : (await Promise.all(pages.map(info))).map((x) => x && x.log.slice(-3).join(' / ')).join(' | '));
      if (!roles) return;
      const hostP = pages[roles.findIndex((r) => r.role === 'host')];
      const clientPs = pages.filter((p, i) => roles[i].role === 'client');
      check(`B/${name}: 1 host + ${humans - 1} clients, ${humans} humans + ${4 - humans} bots`, !!hostP && clientPs.length === humans - 1
        && roles[0].agents.filter((a) => !a.bot).length === humans, roles.map((r) => r.agents.map((a) => (a.bot ? 'b' : 'h')).join('')).join(' '));
      if (!hostP || !clientPs.length) return;
      await sleep(5000);   // versus + READY on both sides
      // the client's input moves its agent on the host
      const c0 = clientPs[0];
      const slot = (await info(c0)).localSlot;
      const moves = [];
      for (const dir of [1, -1, 1, -1]) {
        const x0 = (await info(hostP)).agents.find((a) => a.slot === slot);
        await c0.evaluate((d) => window.fgNet.script(d, 0), dir);
        await sleep(400);
        const xm = (await info(hostP)).agents.find((a) => a.slot === slot);
        await sleep(600);
        const x1 = (await info(hostP)).agents.find((a) => a.slot === slot);
        moves.push({ dir, steer: Math.sign(x1.dir) === dir, dx: x1.x - xm.x, dead: x1.dead || xm.dead });
      }
      await c0.evaluate(() => window.fgNet.script(null));
      // directionX on the host is the client's input; the position must follow while the agent is alive
      check(`B/${name}: client input steers its agent on the host`, moves.every((m) => m.steer), moves.map((m) => `${m.dir > 0 ? '+' : '-'} dir ${m.steer ? 'ok' : 'no'} dx ${m.dx.toFixed(2)}${m.dead ? ' dead' : ''}`).join(', '));
      check(`B/${name}: and moves it that way`, moves.filter((m) => !m.dead && Math.sign(m.dx) === m.dir).length >= 3);
      if (game) {
        await c0.screenshot({ path: path.join(SHOTS, `${name}-client.png`) });
        await hostP.screenshot({ path: path.join(SHOTS, `${name}-host.png`) });
      }
      if (hide) {
        // the host tab goes to the background for 6 s: no animation frames, main-thread timers at 1 Hz
        const c = clientPs[0];
        const before = await Promise.all([info(hostP), info(c)]);
        const t0 = Date.now();
        const hidden = await hostP.evaluate(() => { window.__fgHide(true); return document.hidden && document.visibilityState === 'hidden'; });
        check(`B/${name}: host page reports hidden`, hidden);
        const mid = [];
        for (let i = 0; i < 6; i++) { await sleep(1000); mid.push((await info(c)).net.snaps); }
        const during = await Promise.all([info(hostP), info(c)]);
        const secs = (Date.now() - t0) / 1000;
        await hostP.evaluate(() => window.__fgHide(false));
        const ticks = during[0].tick - before[0].tick, snaps = during[1].net.snaps - before[1].net.snaps;
        const perSec = mid.slice(1).map((v, i) => v - mid[i]);
        check(`B/${name}: hidden host kept the sim at 60 Hz`, ticks > 60 * secs * 0.85 && ticks < 60 * secs * 1.1, `${ticks} ticks in ${secs.toFixed(1)} s`);
        check(`B/${name}: client kept receiving snapshots every second while the host was hidden`, snaps > 30 * secs * 0.8 && Math.min(...perSec) >= 20,
          `${snaps} snapshots in ${secs.toFixed(1)} s, per second ${perSec.join(',')}`);
        const t1 = Date.now(), k1 = (await info(hostP)).tick;
        await sleep(2000);
        const k2 = (await info(hostP)).tick, s2 = (Date.now() - t1) / 1000;
        check(`B/${name}: visible again, the host runs at 60 Hz without a catch-up burst`, Math.abs((k2 - k1) - 60 * s2) < 60 * s2 * 0.15, `${k2 - k1} ticks in ${s2.toFixed(1)} s`);
        report.push(`B/${name}: host hidden ${secs.toFixed(1)} s -> ${ticks} ticks, client got ${snaps} snapshots (${perSec.join(',')} per s), hold ${(await info(c)).net.holdPct}%`);
      }
      let live = pages;
      if (crash) {
        const victim = clientPs[clientPs.length - 1];
        const vslot = (await info(victim)).localSlot;
        await victim.evaluate(() => window.fgNet.crash());
        const t0 = Date.now();
        const bot = await until(async () => { const h = await info(hostP); return h.agents.find((a) => a.slot === vslot).bot; }, 10000, 200);
        check(`B/${name}: crashed client's agent becomes a bot`, !!bot, bot ? `${((Date.now() - t0) / 1000).toFixed(1)} s` : '');
        const t1 = (await info(hostP)).tick;
        await sleep(2000);
        check(`B/${name}: match goes on after the drop`, (await info(hostP)).tick > t1 + 60);
        live = pages.filter((p) => p !== victim);
        const others = clientPs.filter((p) => p !== victim);
        if (others.length) check(`B/${name}: the other client sees the bot`, !!(await until(async () => (await info(others[0])).lastSnap.bots[(await info(others[0])).agents.findIndex((a) => a.slot === vslot)], 4000, 250)));
      }
      const ended = await until(async () => { const r = await Promise.all(live.map(info)); return r.every((x) => x && x.ended) ? r : null; }, (SHORT + 40) * 1000, 500);
      check(`B/${name}: match ends on every page`, !!ended);
      await sleep(1000);
      const H = await info(hostP);
      for (const c of live.filter((p) => clientPs.includes(p))) {
        const C = await info(c);
        const L = C.lastSnap;
        const same = JSON.stringify(L.killSlot) === JSON.stringify(H.killSlot) && JSON.stringify(L.deathSlot) === JSON.stringify(H.deathSlot)
          && L.winnerTeam === H.winnerTeam && L.hp.every((h, i) => Math.abs(h - H.hp[i]) < 0.07);
        check(`B/${name}: ${c.fg} (slot ${C.localSlot}) ends with the host's scores and hp`, same,
          `host k${H.killSlot} d${H.deathSlot} w${H.winnerTeam} hp ${H.hp.map(Math.round)} | client k${L.killSlot} d${L.deathSlot} w${L.winnerTeam} hp ${L.hp.map(Math.round)}`);
        // the host keeps stepping after GAME OVER (bullets expire and raise events): compare with what it had produced
        // by the tick of this client's newest snapshot, not with a count that is still moving
        const through = await hostP.evaluate((t) => window.fgNet.player.net.net.eventsThrough(t), L.tick);
        check(`B/${name}: ${c.fg} has every sim event up to its newest snapshot`, C.lastEvent === through, `${C.lastEvent}/${through} at tick ${L.tick}`);
        const n = C.net;
        report.push(`B/${name} ${c.fg}: down ${n.downBps} B/s, up ${n.upBps} B/s, rtt p50/p95 ${n.rtt.p50}/${n.rtt.p95} ms, inputAck p50/p95 ${n.inputAck.p50}/${n.inputAck.p95} ms, inputVisible p50/p95 ${n.inputVisible.p50}/${n.inputVisible.p95} ms, playback ${n.delayMs} ms (jitter ${n.jitterMs} ms), hold ${n.holdPct}%, snaps ${n.snaps} full ${n.full}`);
      }
      report.push(`B/${name} host: ${H.net.clients.map((c) => `slot ${c.slot}${c.gone ? ' (dropped)' : ''} down ${c.downBps} up ${c.upBps} B/s, input depth ${c.input.avgDepth} starved ${c.input.starved} skipped ${c.input.skipped}`).join('; ')}`);
      if (game) {
        const r = await Promise.all(pages.map((p) => p.evaluate(() => { const a = window.fgNet.app; return a && a.engine ? { fps: 0, errors: (window.fgEngineStats || {}).errors || [] } : null; })));
        check(`B/${name}: game view has no engine errors`, r.every((x) => x && x.errors.length === 0), JSON.stringify(r.map((x) => x && x.errors.slice(0, 2))));
        await c0.screenshot({ path: path.join(SHOTS, `${name}-client-end.png`) });
      }
      // teardown like the game: the match screen stops stepping, the host leaves right away; clients must still get
      // every event before the host's bye
      const E = await hostP.evaluate(() => { const p = window.fgNet.player; p.stop(); if (p.runner) p.runner.running = false; return p.net.net.eventSeq; });
      await hostP.evaluate(() => window.fgNet.leave());
      const liveClients = live.filter((p) => clientPs.includes(p));
      const fin = await until(async () => { const r = await Promise.all(liveClients.map(info)); return r.every((x) => x && x.closed) ? r : null; }, 10000, 100);
      const lg = await hostP.evaluate(() => window.fgNet.player.session.linger || null);
      check(`B/${name}: after the host leaves, every client holds all ${E} events, then sees the host go`, !!fin && fin.every((x) => x.lastEvent === E && x.closed === 'host-left'),
        (fin || []).map((x) => `${x.lastEvent} ${x.closed}`).join(', ') + (lg ? `; host lingered ${lg.ms} ms for ${lg.behind}, ${lg.left} left` : '; nothing to linger for'));
      const errs = errors.slice(errs0);
      check(`B/${name}: no page errors`, errs.length === 0, errs.slice(0, 4).join(' | '));
    } finally {
      await close(pages);
    }
  }

  try {
    if (want('private2')) await scenario('private2', { humans: 2, game: process.env.FG_GAME !== '0' });
    if (want('private4')) await scenario('private4', { humans: 4 });
    if (want('quick')) await scenario('quick', { humans: 2, quick: true });
    if (want('disconnect')) await scenario('disconnect', { humans: 3, crash: true });
    if (want('jitter')) await scenario('jitter', { humans: 2, impair: { delay: '80', jitter: '120', drop: '0.1' } });
    if (want('hidden')) await scenario('hidden', { humans: 2, game: true, hide: true, params: process.env.FG_DRIVER === '0' ? { driver: '0' } : {} });
  } finally {
    await browser.close().catch(() => {});
    if (server) server.close();
  }
}

// ------------------------------------------------------------------------------------------------ main

(async () => {
  try {
    if (PART_A) await partA();
    if (PART_B) await partB();
  } catch (e) {
    console.log('FAIL exception', e && e.stack || e);
    fail++;
  }
  console.log('\n== numbers');
  for (const r of report) console.log('  ' + r);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fails.length) console.log('failed:\n  ' + fails.join('\n  '));
  clearTimeout(HARD_LIMIT);
  process.exit(fail ? 1 : 0);
})();
