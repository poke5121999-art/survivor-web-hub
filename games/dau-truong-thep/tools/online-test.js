// Online layer in four pages of one headless Chrome over ?fakenet=1 (BroadcastChannel): no network, no Unity.
// Host + 2 guests make a room, pick mechs, ready up, play a bot match, one guest leaves, the match ends, everyone
// returns to the lobby and plays again, the host leaves. `timeout 600 node tools/online-test.js`
// PLAYWRIGHT_PATH overrides the playwright-core location.
'use strict';
const path = require('path');
const { serve } = require('../../../tools/thumb-lib.js');
const HOME = require('os').homedir();
const PW = process.env.PLAYWRIGHT_PATH || path.join(HOME, '.cache/pw-node/node_modules/playwright-core');
const { chromium } = require(PW);

let passed = 0, failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (ok) passed++; else failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

(async () => {
  const srv = await serve();
  await require('./lib.js').lockChrome();
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await br.newContext({ viewport: { width: 640, height: 360 } });
  const problems = [];
  const open = async (name) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
    p.on('response', (r) => { if (r.status() >= 400) problems.push(`${name} http ${r.status()} ${r.url()}`); });
    await p.goto(`${srv.base}/games/dau-truong-thep/tools/online-harness.html?fakenet=1`);
    await p.waitForFunction('window.__ready === true');
    return p;
  };
  const info = (p) => p.evaluate('__h.info()');
  const until = async (p, expr, what, ms = 15000) => {
    try { await p.waitForFunction(expr, null, { timeout: ms, polling: 50 }); return true; } catch (e) { check(false, 'timed out: ' + what); return false; }
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const H = await open('host'), A = await open('A'), B = await open('B');

  // ---- lobby ----------------------------------------------------------------------------------------------------
  check(await H.evaluate("__h.online.host({ name: 'Phòng thử', playerName: 'Chủ' })"), 'host creates a room');
  const code = (await info(H)).code;
  check(/^[A-Z0-9]{5}$/.test(code), `room code ${code}`);
  const rooms = await A.evaluate('__h.online.listRooms()');
  check(Array.isArray(rooms) && rooms.some((r) => r.id === code && r.players === 1), `listRooms shows the room (${rooms.length} row)`);
  check(await A.evaluate(`__h.online.join({ code: '${code}', playerName: 'Khách A' })`), 'guest A joins by code');
  check(await B.evaluate(`__h.online.join({ lobbyId: '${code}', playerName: 'Khách B' })`), 'guest B joins by lobby id');
  await until(H, '__h.online.lobby.players.length === 3', 'host sees 3 players');
  const roles = await A.evaluate('[__h.online.state, __h.online.role]');
  check(roles[0] === 'lobby' && roles[1] === 'guest', 'guest is in the lobby');
  const lob = await Promise.all([H, A, B].map(async (p) => (await info(p)).lobby));
  check(same(lob[0], lob[1]) && same(lob[0], lob[2]), 'all three lobbies are identical');
  const teams = lob[0].players.map((p) => p.team);
  check(teams.join('') === '000', `joiners side with the host for co-op (${teams.join('')})`);
  await H.evaluate("__h.online.setRoom({ map: 'cangbang', mode: 'tdm', diff: 'easy' })");
  await A.evaluate("__h.online.setMine({ mech: 'ung', ready: true })");
  await B.evaluate("__h.online.setMine({ mech: 'hac', paint: 'vang', mods: { hp: 1.2, dmg: 1.1 }, ready: true })");
  await until(H, '__h.online.lobby.players.every((p) => p.ready)', 'everyone ready');
  await until(B, "__h.online.lobby.players[2].paint === 'vang' && __h.online.lobby.map === 'cangbang'", 'B sees the final lobby');
  const ls = (await info(B)).lobby;
  check(ls.map === 'cangbang' && ls.diff === 'easy' && ls.players[1].mech === 'ung' && ls.players[2].paint === 'vang', 'room settings and picks reach every guest');
  check(await A.evaluate('__h.online.start()') === false && (await info(A)).state === 'lobby', 'a guest cannot start the match');
  check(await H.evaluate('__h.online.swapTeam("p1")') && (await H.evaluate('__h.online.lobby.players[1].team')) === 1, 'host swaps a guest to the other team');
  await H.evaluate('__h.online.swapTeam("p1")');

  // ---- room chat in the lobby -------------------------------------------------------------------------------------
  const sayOn = (P, t) => P.evaluate((x) => __h.online.say(x), t);
  const texts = (P) => P.evaluate('window.__chat.map((m) => m.text)');
  for (const P of [H, A, B]) await P.evaluate("window.__chat = []; __h.G.bus.on('net:chat', (m) => window.__chat.push(m))");
  const arrived = (n, what) => Promise.all([H, A, B].map((P) => until(P, `window.__chat.length >= ${n}`, what)));
  check(await sayOn(H, 'h1') && (await arrived(1, 'first line everywhere')).every(Boolean), 'host says a line, host and both guests receive it');
  check(await sayOn(A, 'a1') && (await arrived(2, 'a1')).every(Boolean), 'guest A says a line, it is relayed to the host and to guest B');
  check(await sayOn(B, 'b1') && (await arrived(3, 'b1')).every(Boolean), 'guest B says a line, it reaches the host and guest A');
  await sayOn(H, 'h2'); await arrived(4, 'h2');
  await sayOn(A, 'a2'); await arrived(5, 'a2');
  const logs = await Promise.all([H, A, B].map(texts));
  check(logs.every((l) => l.join() === 'h1,a1,b1,h2,a2'), `all three pages hold the same lines in the same order (${logs[0].join(' ')})`);
  const first = await H.evaluate('window.__chat.slice(0, 3)');
  check(first.map((m) => m.id).join() === 'p0,p1,p2' && first.map((m) => m.name).join() === 'Chủ,Khách A,Khách B' && first.every((m) => m.team === 0 && typeof m.t === 'number' && m.t > 1e12), `payload is { id, name, team, text, t }: ${JSON.stringify(first[1])}`);
  const mirror = await B.evaluate('window.__chat.slice(0, 3).map((m) => m.id + ":" + m.name).join()');
  check(mirror === 'p0:Chủ,p1:Khách A,p2:Khách B', 'a guest sees the same sender ids and names as the host');

  const before = (await texts(H)).length;
  check(!(await sayOn(A, '   ')) && !(await sayOn(A, '\u0001\u0007')), 'an empty line, or one that is only control characters, is not sent');
  const long = ' ' + 'é'.repeat(200);
  check(await sayOn(B, long), 'a 200-character line is accepted');
  await arrived(6, 'long line');
  const cut = await Promise.all([H, A, B].map((P) => P.evaluate('window.__chat[5].text')));
  check(cut.every((t) => t === 'é'.repeat(120)), `an over-long line is trimmed and cut to 120 characters on host and guests (${cut.map((t) => t.length).join('/')})`);
  await sayOn(A, 'he\u0001l\u0007lo​\n!');
  await arrived(7, 'control characters');
  const ctl = await Promise.all([H, A, B].map((P) => P.evaluate('window.__chat[6].text')));
  check(ctl.every((t) => t === 'hello​!') || ctl.every((t) => t === 'hello!'), `control characters are stripped (${JSON.stringify(ctl[0])})`);
  check((await texts(H)).length === before + 2, 'the refused lines never reached the room');

  // 6th line in 10 s: host first (it has sent h1, h2 already), then a guest that only sent nothing yet
  for (const P of [H, A, B]) await P.evaluate('window.__chat = []');
  const hr = [];
  for (const t of ['h3', 'h4', 'h5', 'h6']) hr.push(await sayOn(H, t));
  await sleep(500);
  const hostLog = await Promise.all([H, A, B].map(texts));
  check(hr.join() === 'true,true,true,false' && hostLog.every((l) => l.join() === 'h3,h4,h5'), `host: the 6th line within 10 s is dropped (results ${hr.join('/')}, everyone saw ${hostLog[0].join(' ')})`);
  const C = await open('C');
  check(await C.evaluate(`__h.online.join({ code: '${code}', playerName: 'Khách C' })`), 'guest C joins to test its own limit');
  await until(H, '__h.online.lobby.players.length === 4', 'host sees C');
  for (const P of [H, A, B]) await P.evaluate('window.__chat = []');
  await C.evaluate("window.__chat = []; __h.G.bus.on('net:chat', (m) => window.__chat.push(m))");
  const cr = [];
  for (let i = 1; i <= 6; i++) cr.push(await sayOn(C, 'c' + i));
  await sleep(700);
  const cLogs = await Promise.all([H, A, B].map(texts));
  check(cr.join() === 'true,true,true,true,true,false' && cLogs.every((l) => l.join() === 'c1,c2,c3,c4,c5'), `guest: its 6th line within 10 s is dropped (results ${cr.join('/')}, host saw ${cLogs[0].join(' ')})`);
  await C.evaluate('__h.online.leave()');
  await until(H, '__h.online.lobby.players.length === 3', 'C gone again');
  check(!(await sayOn(C, 'x')), 'say() on a page that is not in a room returns false');
  await C.close();
  for (const P of [H, A, B]) await P.evaluate('window.__chat = []');

  check(await H.evaluate('__h.online.start()'), 'host starts the match');

  // ---- playing --------------------------------------------------------------------------------------------------
  await until(A, "__h.online.state === 'playing'", 'A playing'); await until(B, "__h.online.state === 'playing'", 'B playing');
  const infos = await Promise.all([H, A, B].map(info));
  check(infos.every((i) => i.state === 'playing'), 'every page reaches playing');
  check(same(infos[0].roster, infos[1].roster) && same(infos[0].roster, infos[2].roster) && same(infos[0].rosterMeta, infos[1].rosterMeta), 'same roster on every page');
  const ros = infos[0].roster;
  check(ros.length === 10 && ros.filter((u) => !u[3]).length === 3 && ros.filter((u) => u[0] === 0).length === 5, '10 units, 3 humans, 5 per team, bots fill the rest');
  const slots = infos.map((i) => i.mySlot);
  check(new Set(slots).size === 3 && slots.every((s, k) => ros[s][4] === infos[k].me), `each page owns a distinct human unit (${slots.join(',')})`);
  check(ros[slots[1]][1] === 'ung' && ros[slots[2]][1] === 'hac' && ros.every((u) => u[5] === 'easy'), 'chosen mechs and difficulty land in the roster');
  check(infos.every((i) => i.topics.includes('net:start')), 'net:start fired on host and guests');

  const D = await open('late');
  const lateOk = await D.evaluate(`__h.online.join({ code: '${code}', playerName: 'Muộn' })`);
  const late = await info(D);
  check(!lateOk && late.state === 'off' && /đã bắt đầu/.test(late.error), `late joiner is refused: "${late.error}"`);
  await D.close();

  // chat keeps working while the match runs, and the 10 s window slides: retry until the earlier lines expire
  let inMatch = false;
  for (let i = 0; i < 30 && !inMatch; i++) { inMatch = await sayOn(B, 'trong trận'); if (!inMatch) await sleep(500); }
  await until(H, 'window.__chat.length >= 1', 'in-match line on host'); await until(A, 'window.__chat.length >= 1', 'in-match line on A');
  check(inMatch && (await texts(H)).join() === 'trong trận' && (await texts(A)).join() === 'trong trận', 'during a match a guest line reaches the host and the other guest (and a refused line is accepted again once the window has slid)');
  await sleep(3000);
  // guests track the host while the fight runs: same tick history, interpolated within 1.5 m of the host's live position
  let near = 0, total = 0, worstHist = 0, maxCur = 0;
  for (let i = 0; i < 40; i++) {
    for (const P of [A, B]) {
      const v = await P.evaluate('__h.view');
      const hp = await H.evaluate(`({ at: __h.posAt(${v.tick}), cur: __h.current() })`);
      if (!hp.at) continue;
      v.raw.forEach((p, k) => { worstHist = Math.max(worstHist, dist(p, hp.at[k])); });
      v.pos.forEach((p, k) => { const d = dist(p, hp.cur.pos[k]); total++; if (d <= 1.5) near++; maxCur = Math.max(maxCur, d); });
    }
    await sleep(60);
  }
  check(worstHist <= 0.02, `guest snapshot positions equal the host's at the same tick (worst ${worstHist.toFixed(3)} m)`);
  check(total > 0 && near / total >= 0.9, `interpolated guest units within 1.5 m of the host live (${near}/${total}, max ${maxCur.toFixed(2)} m)`);

  // a scripted guest input moves that guest's unit on the host
  const pos = (s) => H.evaluate(`[__h.G.match.units[${s}].x, __h.G.match.units[${s}].z]`);
  const [bx, bz] = await pos(slots[1]);
  const bBefore = await pos(slots[2]);
  const len = Math.hypot(bx, bz);
  await A.evaluate(`__h.script = { mx: ${-bx / len}, mz: ${-bz / len}, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 }`);
  await sleep(1500);
  const after = await pos(slots[1]);
  const moved = (after[0] - bx) * (-bx / len) + (after[1] - bz) * (-bz / len);
  const bAfter = await pos(slots[2]);
  check(moved > 4, `guest A input moved its unit ${moved.toFixed(1)} m toward the centre on the host`);
  check(dist(bBefore, bAfter) < 1.5, `guest B (neutral input) stayed put (${dist(bBefore, bAfter).toFixed(2)} m)`);
  await A.evaluate('__h.script = null');

  await B.evaluate('__h.script = { mx: 0, mz: 0, aim: 0, fire: true, s1: true, s2: false, ult: false, heal: false, tx: 0, tz: 0 }');
  await sleep(2500);
  await B.evaluate('__h.script = null');

  // events: whatever the guest replayed is exactly what the host produced, in order
  await H.evaluate('__h.hold = true');
  await sleep(1500);
  const hl = await H.evaluate('__h.hostLog'), gl = await Promise.all([A, B].map((p) => p.evaluate('__h.guestLog')));
  for (const [name, log] of [['A', gl[0]], ['B', gl[1]]]) {
    check(log.length > 50 && log.length === hl.length && log.every((e, i) => e === hl[i]), `events on guest ${name} arrive in order, none lost or duplicated (${log.length} of ${hl.length})`);
  }
  const types = new Set(hl.map((e) => JSON.parse(e).t));
  check(types.has('fire') && types.has('skill'), `fire and skill events were part of it (${[...types].slice(0, 8).join(' ')}...)`);
  const hs = await info(H);
  for (const [name, P] of [['A', A], ['B', B]]) {
    const g = await info(P);
    const worst = Math.max(...hs.units.map((u, k) => dist([u.x, u.z], [g.units[k].x, g.units[k].z])));
    const hpd = Math.max(...hs.units.map((u, k) => Math.abs(u.hp - g.units[k].hp)));
    check(g.tick === hs.tick && same(g.score, hs.score) && worst <= 0.02 && hpd <= 1, `guest ${name} mirror equals the host at tick ${hs.tick} (score ${g.score}, worst ${worst.toFixed(3)} m, hp ${hpd})`);
  }
  await H.evaluate('__h.hold = false');

  // ---- a guest leaves: its unit becomes a bot --------------------------------------------------------------------
  await B.evaluate('__h.online.leave()');
  await until(H, `__h.G.match.units[${slots[2]}].bot === true`, 'B unit turns into a bot');
  const afterLeave = await info(H);
  check(afterLeave.units[slots[2]].bot && !afterLeave.units[slots[1]].bot && afterLeave.lobby.players.length === 2, 'guest B left: its unit is a bot, A and host stay human, lobby has 2 players');
  const bState = await info(B);
  check(bState.state === 'off' && bState.role === null, 'guest B is off');
  check(await until(A, `__h.mirror && __h.mirror.units[${slots[2]}].bot === true`, 'A sees the bot flag'), 'guest A sees B\'s unit as a bot');
  await sleep(800);

  // ---- match ends, everyone back to the lobby ---------------------------------------------------------------------
  await H.evaluate('__h.forceOver = true');
  await until(A, '__h.view && __h.view.over === true', 'A sees the match end');
  check(await A.evaluate('__h.guestLog.some((e) => JSON.parse(e).t === "over")'), 'the guest replayed the over event');
  await H.evaluate('__h.online.toLobby()'); await A.evaluate('__h.online.toLobby()');
  await until(A, "__h.online.state === 'lobby' && __h.online.lobby.players.every((p) => p.host || !p.ready)", 'back in the lobby with ready cleared');
  const back = await Promise.all([H, A].map(info));
  check(back.every((i) => i.state === 'lobby') && back[0].lobby.players.length === 2, 'host and A are back in the lobby');

  check(await B.evaluate(`__h.online.join({ code: '${code}', playerName: 'Khách B' })`), 'B rejoins the room');
  await until(H, '__h.online.lobby.players.length === 3', 'host sees B again');
  await A.evaluate('__h.online.setMine({ ready: true })'); await B.evaluate("__h.online.setMine({ mech: 'bang', ready: true })");
  await until(H, '__h.online.lobby.players.every((p) => p.ready)', 'ready again');
  const fit = await H.evaluate("(() => { const o = __h.online, out = []; o.setRoom({ mode: 'nha' }); out.push(o.lobby.map); o.setRoom({ map: 'denrung' }); out.push(o.lobby.map); o.setRoom({ map: 'hemcheo' }); out.push(o.lobby.map); o.setRoom({ mode: 'tdm' }); out.push(o.lobby.map); return out; })()");
  check(fit.join() === 'luythep,luythep,hemcheo,denrung', `the room keeps a base-assault layout in Thủ nhà and an arena elsewhere (${fit.join()})`);
  check(await H.evaluate("__h.online.setRoom({ mode: 'trum' })"), 'room switches to Săn trùm with 3 players');
  check(await H.evaluate('__h.online.start()'), 'second match starts');
  await until(A, "__h.online.state === 'playing' && __h.view && __h.view.tick > 20", 'A in the second match');
  await until(B, "__h.online.state === 'playing' && __h.view && __h.view.tick > 20", 'B in the second match');
  const second = await Promise.all([H, A, B].map(info));
  check(second[0].roster.length === 6 && second[0].roster[5][1] === 'titan' && same(second[0].roster, second[2].roster), 'trum roster: 5 + boss, identical on every page');

  // ---- the host leaves ------------------------------------------------------------------------------------------
  await H.evaluate('__h.online.leave()');
  await until(A, "__h.online.state === 'off'", 'A loses the host'); await until(B, "__h.online.state === 'off'", 'B loses the host');
  const lost = await Promise.all([A, B].map(info));
  check(lost.every((i) => i.topics.includes('net:lost') && i.state === 'off' && /Chủ phòng/.test(i.error)), `guests got net:lost ("${lost[0].error}")`);

  check(problems.length === 0, 'no console errors or failed requests' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  await br.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
