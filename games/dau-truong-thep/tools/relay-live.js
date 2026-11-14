// Co-op over the REAL Unity Relay (no fakenet): three separate pages (own browser contexts, so own Unity identities) on one hub URL.
// The host creates a public room; guest A finds it in the room list and joins by lobby id; guest B joins by the room code.
// All three play one full team match against bots, and the script compares score, kills and the result on every machine.
//   DTT_BASE=https://<hub> node tools/relay-live.js        (without DTT_BASE it serves the local tree; the relay is still the real one)
'use strict';
const { launch, open, checker, CHK, fs, path } = require('./lib.js');
const { serve } = require('../../../tools/thumb-lib.js');
const check = checker();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, expr, ms, label) {
  try { await page.waitForFunction(expr, null, { timeout: ms, polling: 250 }); return true; } catch (e) { console.log('TIMEOUT ' + label + ': ' + (await page.evaluate(`JSON.stringify({ state: __G.online.state, error: __G.online.error, mode: __G.mode })`))); return false; }
}

// A stand-in for a person: walk toward the nearest enemy, aim at it, hold fire, press skills now and then.
const PILOT = `window.__input((m, u) => {
  let best = null, bd = 1e9;
  for (const o of m.units) { if (o.team === u.team || !o.alive) continue; const d = Math.hypot(o.x - u.x, o.z - u.z); if (d < bd) { bd = d; best = o; } }
  if (!best) return { mx: 0, mz: 0, aim: u.aim, fire: false, s1: false, s2: false, ult: false, heal: false, tx: u.x, tz: u.z };
  const a = Math.atan2(best.z - u.z, best.x - u.x), go = bd > 9 ? 1 : bd < 5 ? -1 : 0, t = Math.floor(m.time);
  return { mx: Math.cos(a) * go + Math.sin(m.time) * 0.5, mz: Math.sin(a) * go + Math.cos(m.time) * 0.5, aim: a, fire: bd < 15, s1: t % 9 === 0, s2: t % 11 === 0, ult: t % 23 === 0, heal: u.hp < u.maxHp * 0.5, tx: best.x, tz: best.z };
})`;

(async () => {
  fs.mkdirSync(CHK, { recursive: true });
  const remote = process.env.DTT_BASE;
  const srv = remote ? { base: remote, close() {} } : await serve();
  const br = await launch();
  const names = ['Chủ phòng', 'Khách danh sách', 'Khách mã'];
  try {
    const sessions = [];
    for (let i = 0; i < 3; i++) sessions.push(await open(br, srv.base, 'noaudio&q=low'));
    const [H, A, B] = sessions.map((s) => s.page);
    const room = 'Kiểm relay ' + Date.now().toString(36);
    console.log('base ' + srv.base + ', fakenet in URL: ' + /fakenet/.test(H.url()));

    await H.evaluate(({ room, name }) => { window.__G.online.host({ name: room, isPrivate: false, playerName: name }); }, { room, name: names[0] });
    check(await until(H, `__G.online.state === 'lobby' && !!__G.online.code`, 40000, 'host lobby'), 'host creates a room on the real relay and gets a code');
    const code = await H.evaluate('__G.online.code');
    console.log('room code ' + code);

    let row = null;
    for (let i = 0; i < 12 && !row; i++) { const rows = await A.evaluate('__G.online.listRooms()'); row = rows.find((r) => r.name === room) || null; if (!row) await sleep(1500); }
    check(!!row, 'guest A sees the room in the public room list' + (row ? ` (${row.players}/${row.max}, host ${row.host})` : ''));
    if (row) await A.evaluate(({ id, name }) => { window.__G.online.join({ lobbyId: id, playerName: name }); }, { id: row.id, name: names[1] });
    check(await until(A, `__G.online.state === 'lobby'`, 40000, 'guest A lobby'), 'guest A joins from the list (by lobby id)');
    await B.evaluate(({ code, name }) => { window.__G.online.join({ code, playerName: name }); }, { code, name: names[2] });
    check(await until(B, `__G.online.state === 'lobby'`, 40000, 'guest B lobby'), 'guest B joins by typing the room code');

    await until(H, `__G.online.lobby.players.length === 3`, 20000, 'three players');
    await H.evaluate(`__G.online.setRoom({ map: 'denrung', mode: 'tdm', diff: 'easy' })`);
    await A.evaluate(`__G.online.setMine({ mech: 'soi', ready: true })`);
    await B.evaluate(`__G.online.setMine({ mech: 'hac', ready: true })`);
    await until(H, `__G.online.lobby.players.every((p) => p.ready)`, 20000, 'all ready');
    // Lobby changes travel host → guests over the relay: give them up to 10 s to arrive before comparing.
    let lobbies = [];
    for (let i = 0; i < 20; i++) {
      lobbies = [];
      for (const p of [H, A, B]) lobbies.push(await p.evaluate(`JSON.stringify(__G.online.lobby.players.map((p) => [p.name, p.mech, p.team, p.ready]))`));
      if (lobbies[0] === lobbies[1] && lobbies[1] === lobbies[2]) break;
      await sleep(500);
    }
    check(lobbies[0] === lobbies[1] && lobbies[1] === lobbies[2], 'all three machines show the same lobby: ' + lobbies[0]);
    check(JSON.parse(lobbies[0]).every((p) => p[2] === 0), 'all three humans are on the same team (co-op against bots)');

    const started = await H.evaluate('__G.online.start()');
    check(started !== false, 'host starts the match' + (started === false ? ': ' + (await H.evaluate('__G.online.error')) : ''));
    for (const [i, p] of [H, A, B].entries()) check(await until(p, `__G.mode === 'match' && __G.match && __G.match.units.length === 10`, 40000, 'match on ' + names[i]), `${names[i]}: the match is running with 10 units`);
    for (const p of [H, A, B]) await p.evaluate(PILOT);
    const info = [];
    for (const p of [H, A, B]) info.push(await p.evaluate(`({ me: __G.me, role: __G.online.role, humans: __G.match.units.filter((u) => !u.bot).map((u) => u.id + ':' + u.team + ':' + u.mech).join(','), mech: __G.match.units[__G.me].mech })`));
    check(info[0].role === 'host' && info[1].role === 'guest' && info[2].role === 'guest', 'one host, two guests');
    check(new Set(info.map((i) => i.me)).size === 3 && info[1].mech === 'soi' && info[2].mech === 'hac', `each machine drives its own mech (slots ${info.map((i) => i.me).join(', ')})`);
    check(info[0].humans === info[1].humans && info[1].humans === info[2].humans && info[0].humans.split(',').length === 3, 'same three human units everywhere, bots fill the other seven: ' + info[0].humans);

    await sleep(8000);
    const before = await H.evaluate(`(() => { const u = __G.match.units[${info[1].me}]; return [u.x, u.z]; })()`);
    await sleep(3000);
    const after = await H.evaluate(`(() => { const u = __G.match.units[${info[1].me}]; return [u.x, u.z, u.dmg]; })()`);
    check(Math.hypot(after[0] - before[0], after[1] - before[1]) > 1 || after[2] > 0, `guest A's input drives its mech on the host (moved ${Math.hypot(after[0] - before[0], after[1] - before[1]).toFixed(1)} m, damage ${Math.round(after[2])})`);

    let samples = 0, agree = 0, last = '';
    const t0 = Date.now();
    while (Date.now() - t0 < 420000) {
      await sleep(10000);
      const s = [];
      for (const p of [H, A, B]) s.push(await p.evaluate(`({ tick: __G.match.tick, score: __G.match.score.join('-'), over: __G.match.over, mode: __G.mode })`));
      samples++;
      // Guests render one snapshot behind the host, so a kill can land between two reads: scores within one kill count as agreeing.
      const sc = s.map((x) => x.score.split('-').map(Number));
      if (sc.every((v) => Math.abs(v[0] - sc[0][0]) <= 1 && Math.abs(v[1] - sc[0][1]) <= 1)) agree++;
      last = s.map((x) => x.score).join(' | ');
      console.log(`t+${Math.round((Date.now() - t0) / 1000)}s  host ${s[0].score} @${s[0].tick}  guestA ${s[1].score} @${s[1].tick}  guestB ${s[2].score} @${s[2].tick}`);
      if (s.every((x) => x.mode === 'result')) break;
    }
    check(samples > 0 && agree === samples, `scores agree on all machines during play (${agree}/${samples} samples, last ${last})`);

    const ends = [];
    for (const p of [H, A, B]) ends.push(await p.evaluate(`({ mode: __G.mode, over: __G.match.over, winner: __G.match.winner, score: __G.match.score.join('-'), time: Math.round(__G.match.time),
      kills: __G.match.units.map((u) => u.kills).join(','), deaths: __G.match.units.map((u) => u.deaths).join(','), shown: !!document.querySelector('#ui .screen.result') && getComputedStyle(document.querySelector('#ui .screen.result')).display !== 'none', errors: window.__errors })`));
    check(ends.every((e) => e.over && e.mode === 'result' && e.shown), 'the match ends and every machine shows the result screen');
    check(ends[0].score === ends[1].score && ends[1].score === ends[2].score && ends[0].winner === ends[1].winner && ends[1].winner === ends[2].winner, `same final score and winner everywhere: ${ends[0].score}, winner team ${ends[0].winner}, ${ends[0].time} s`);
    check(ends[0].kills === ends[1].kills && ends[1].kills === ends[2].kills, 'same kills per mech everywhere: ' + ends[0].kills);
    check(ends[0].deaths === ends[1].deaths && ends[1].deaths === ends[2].deaths, 'same deaths per mech everywhere: ' + ends[0].deaths);
    const probs = sessions.map((s) => s.problems).flat();
    check(ends.every((e) => e.errors.length === 0) && probs.length === 0, 'no errors on any machine' + (probs[0] ? ': ' + probs[0].slice(0, 240) : '') + (ends.find((e) => e.errors.length) ? ': ' + ends.find((e) => e.errors.length).errors[0].slice(0, 240) : ''));
    for (const [i, p] of [H, A, B].entries()) await p.screenshot({ path: path.join(CHK, `relay-live-${['host', 'guestA', 'guestB'][i]}.png`) });
    await H.evaluate(`__G.online.leave()`);
  } finally {
    await br.close().catch(() => {});
    srv.close();
  }
  check.done();
})().catch((e) => { console.log('CRASH ' + (e && e.stack ? e.stack : e)); process.exit(1); });
