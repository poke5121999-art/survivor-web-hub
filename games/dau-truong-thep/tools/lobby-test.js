'use strict';
// The online screens on the REAL game page, two pages of one browser context over ?fakenet=1 (BroadcastChannel).
// A creates a room through the UI, B joins by the code on A's screen, B picks another mech and readies, A changes mode and
// map and starts; both run the match, A ends it, both go back to the room through "Về phòng".
// Run: timeout 300 node tools/lobby-test.js      (PLAYWRIGHT_PATH overrides the playwright-core location)
const path = require('path');
const { serve } = require('../../../tools/thumb-lib.js');
const { CHK, fs } = require('./lib.js');
const PW = process.env.PLAYWRIGHT_PATH || path.join(process.env.HOME, '.cache/pw-node/node_modules/playwright-core');
const { chromium } = require(PW);

const GAME = '/games/dau-truong-thep/index.html?fakenet=1&noaudio&q=low&seed=5';
let passed = 0, failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (ok) passed++; else failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

(async () => {
  fs.mkdirSync(CHK, { recursive: true });
  const { MECHS } = await import('../js/data.js');
  const srv = process.env.DTT_BASE ? { base: process.env.DTT_BASE, close() {} } : await serve();
  const gl = process.env.DTT_GL || 'gl-egl';
  await require('./lib.js').lockChrome();
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=' + gl, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'smoke@test' })); } catch (e) { /* storage blocked */ } });
  const problems = [];
  const open = async (name) => {
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console: ${m.text()}`); });
    p.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
    p.on('response', (r) => { if (r.status() >= 400) problems.push(`${name} http ${r.status()} ${r.url()}`); });
    await p.goto(srv.base + GAME);
    await p.waitForFunction('window.__ready === true', null, { timeout: 180000 });
    await p.evaluate(() => { const b = document.getElementById('boot'); if (b) b.style.display = 'none'; });
    return p;
  };
  const until = async (p, expr, what, ms = 20000) => {
    try { await p.waitForFunction(expr, null, { timeout: ms, polling: 50 }); return true; } catch (e) { check(false, 'timed out: ' + what); return false; }
  };
  const shot = (p, name) => p.screenshot({ path: `${CHK}/lobby-${name}.png` });
  const seats = (p) => p.evaluate(() => [...document.querySelectorAll('#ui .lobby .seat:not(.bot)')].map((s) => ({
    name: s.querySelector('.st-n > span').textContent, mech: s.querySelector('.st-m').textContent.trim(), ready: s.classList.contains('rdy'),
    host: !!s.querySelector('.badge'), me: !!s.querySelector('.you'),
  })));
  const model = (p) => p.evaluate(() => { const L = __G.online.lobby; return { map: L.map, mode: L.mode, diff: L.diff, players: L.players.map((x) => [x.name, x.mech, x.team, x.ready, x.host]) }; });
  const info = (p) => p.evaluate(() => {
    const G = __G, m = G.match, u = m && m.units[G.me];
    return { mode: G.mode, state: G.online.state, me: G.me, mySlot: G.online.mySlot, map: m && m.map.key, rule: m && m.mode, units: m && m.units.length, score: m && m.score.slice(),
      mech: u && u.mech, name: u && u.name, pos: u && [u.x, u.z], tick: m && m.tick, over: m && m.over };
  });
  const posOf = (p, slot) => p.evaluate((s) => { const u = __G.match.units[s]; return [u.x, u.z]; }, slot);
  const errorsOf = (p) => p.evaluate('window.__errors.slice()');

  const A = await open('A'), B = await open('B');
  check(await A.evaluate('typeof __G.ui.showLobby === "function" && typeof __G.ui.hideLobby === "function"'), 'makeUI exports showLobby and hideLobby');

  // ---- A: entry screen, create ----------------------------------------------------------------------------------
  check(await A.locator('#ui .netbtn').isVisible() && /Chơi mạng/.test(await A.locator('#ui .netbtn').textContent()), 'menu shows the "Chơi mạng" button next to "Vào trận"');
  await A.click('#ui .netbtn');
  await until(A, 'document.querySelector("#ui .online.on") && document.querySelectorAll("#ui .rm-empty").length === 1', 'entry screen with an empty room list');
  check(/Chưa có phòng nào đang mở/.test(await A.textContent('#ui .rm-list')), 'entry: empty room list says so');
  await A.fill('#ui .online [data-r="name"]', 'Chủ Nhà');
  await A.press('#ui .online [data-r="name"]', 'Tab');
  await A.fill('#ui .online [data-r="room"]', 'Phòng thử');
  await sleep(500);
  await shot(A, 'entry');
  await A.click('#ui .online [data-r="create"]');
  await until(A, 'document.querySelector("#ui .lobby.on") && /^[A-Z0-9]{5}$/.test(document.querySelector("#ui .lb-code b").textContent)', 'A in the lobby with a room code');
  const code = (await A.textContent('#ui .lb-code b')).trim();
  check(/^[A-Z0-9]{5}$/.test(code), `A reads room code ${code}`);
  check(await A.evaluate('!document.querySelector("#ui .online.on") && !document.querySelector("#ui .menu.on")'), 'entry and menu are closed behind the lobby');
  await A.click('#ui .lobby [data-a="copy"]');
  await until(A, 'document.querySelector("#ui .toast.on")', 'copy toast');
  check((await A.textContent('#ui .toast')).includes(code), `copy button reports the code in a toast ("${(await A.textContent('#ui .toast')).trim()}")`);

  // ---- B: wrong code, the room list, join by code ----------------------------------------------------------------
  await B.click('#ui .netbtn');
  await until(B, 'document.querySelector("#ui .online.on")', 'B entry screen');
  await until(B, `document.querySelector('#ui .rm[data-room="${code}"]')`, 'A\'s room in the list', 8000);
  const row = await B.evaluate(() => { const r = document.querySelector('#ui .rm-list .rm'); return r ? [r.querySelector('.rm-n b').textContent, r.querySelector('.rm-n small').textContent, ...[...r.querySelectorAll(':scope > span')].slice(1).map((s) => s.textContent)] : []; });
  check(row.join('|') === 'Phòng thử|Chủ phòng: Chủ Nhà|Đấu đội|Đền Rừng|1/10', `room list row: ${row.join(' | ')}`);
  await B.fill('#ui .online [data-r="name"]', 'Khách Hai');
  await B.press('#ui .online [data-r="name"]', 'Tab');
  await B.fill('#ui .online [data-r="code"]', 'zzzzz');
  await B.click('#ui .online [data-r="joinCode"]');
  check(await until(B, 'document.querySelector("#ui .ol-wait.on")', 'connecting overlay', 3000), 'connecting overlay shows while joining');
  await until(B, 'document.querySelector("#ui .online > .ol-err:not([hidden])")', 'inline error for a wrong code', 8000);
  const err = await B.textContent('#ui .online > .ol-err');
  check(err === 'Không tìm thấy phòng. Hãy kiểm tra lại mã phòng.' && await B.evaluate('!document.querySelector("#ui .ol-wait.on") && __G.online.state === "off"'), `wrong code: inline error "${err}", back to the form`);
  await B.fill('#ui .online [data-r="code"]', code.toLowerCase());
  await B.click('#ui .online [data-r="joinCode"]');
  await until(B, 'document.querySelector("#ui .lobby.on")', 'B in the lobby');
  await until(A, 'document.querySelectorAll("#ui .lobby .seat:not(.bot)").length === 2', 'A sees two seats');
  const sa = await seats(A), sb = await seats(B);
  const norm = (l) => l.map((s) => ({ name: s.name, mech: s.mech, ready: s.ready, host: s.host }));
  check(JSON.stringify(norm(sa)) === JSON.stringify(norm(sb)) && sa.length === 2, 'both pages list the same two players');
  check(sa[0].name === 'Chủ Nhà' && sa[0].host && sa[0].me && sa[1].name === 'Khách Hai' && !sa[1].host && !sa[1].ready && sb[1].me && !sb[0].me, `seats: ${sa.map((s) => s.name + (s.host ? ' (chủ phòng)' : '')).join(', ')}; "Bạn" marks each own seat`);
  check(await B.locator('#ui .lobby .lb-code b').textContent() === code && (await B.locator('#ui .lobby [data-a="mode"]').count()) === 0 && (await B.locator('#ui .lobby [data-a="start"]').count()) === 0, 'guest sees the code, no host controls');

  // ---- chat in the lobby: a line typed in B's lobby UI shows up in A's ------------------------------------------------
  const CH = '#ui .lobby .chatbox.in-lobby';
  const chatRows = (p) => p.evaluate((sel) => [...document.querySelectorAll(sel + ' .cl')].map((r) => `${r.querySelector('b').textContent}|${r.querySelector('span').textContent}|${r.querySelectorAll('span *').length}`), CH);
  check(await A.locator(CH + ' input').isVisible() && await B.locator(CH + ' input').isVisible(), 'both lobbies show the chat box with its input');
  await B.fill(CH + ' input', 'Chào chủ phòng <b>x</b>');
  await B.press(CH + ' input', 'Enter');
  await until(A, `document.querySelectorAll("${CH} .cl").length === 1`, 'B\'s line on A');
  await until(B, `document.querySelectorAll("${CH} .cl").length === 1`, 'B\'s line on B');
  await sleep(300);
  const ca = await chatRows(A), cb = await chatRows(B);
  check(ca.join() === 'Khách Hai|Chào chủ phòng <b>x</b>|0' && cb.join() === ca.join(), `a line typed in B's lobby shows in A's lobby as text, once on each page (${ca.join()})`);
  check(await B.evaluate((sel) => document.querySelector(sel + ' input').value === '', CH), 'B\'s input is empty after sending');
  await A.click(CH + ' [data-q="3"]');
  await until(B, `document.querySelectorAll("${CH} .cl").length === 2`, 'A\'s quick phrase on B');
  await until(A, `document.querySelectorAll("${CH} .cl").length === 2`, 'A\'s quick phrase on A');
  check((await chatRows(B))[1] === 'Chủ Nhà|Hay lắm!|0', `the host's quick phrase "Hay lắm!" reaches B (${(await chatRows(B))[1]})`);
  await A.fill(CH + ' input', 'chưa gửi xong');
  await A.evaluate(() => { const o = __G.online; for (let i = 0; i < 3; i++) __G.bus.emit('net:lobby', o.lobby); });
  check(await A.evaluate((sel) => document.querySelector(sel + ' input').value === 'chưa gửi xong' && document.activeElement === document.querySelector(sel + ' input'), CH), 'a lobby redraw on A keeps its half-typed chat line and focus');
  await A.fill(CH + ' input', '');
  await A.evaluate(() => document.activeElement && document.activeElement.blur());

  // ---- B picks a different mech and readies ------------------------------------------------------------------------
  const was = (await seats(B))[1].mech;
  check(was === MECHS.trau.name, `B starts on the saved favourite (${was})`);
  await B.click('#ui .lobby .lm[data-k="ung"]');
  await B.click('#ui .lobby [data-a="ready"]');
  await until(A, 'document.querySelectorAll("#ui .lobby .seat.rdy").length === 2', 'B ready on A');
  const sa2 = await seats(A);
  check(sa2[1].mech === MECHS.ung.name && sa2[1].ready, `A sees B on another mech (${sa2[1].mech}) and ready`);
  check((await model(A)).players[1][1] === 'ung' && (await model(A)).players[1][3] === true, 'host model: B is "ung" and ready');

  // ---- A changes mode and map -------------------------------------------------------------------------------------
  await A.click('#ui .lobby .mode[data-k="chiem"]');
  await A.click('#ui .lobby .map[data-k="cangbang"]');
  await A.click('#ui .lobby .seg [data-k="easy"]');
  await until(B, '__G.online.lobby.mode === "chiem" && __G.online.lobby.map === "cangbang" && __G.online.lobby.diff === "easy"', 'B sees the new settings');
  const kv0 = await B.evaluate(() => [...document.querySelectorAll('#ui .lobby .kv b')].map((b) => b.textContent));
  check(kv0.join() === 'Chiếm điểm,Cảng Băng,Theo bố cục,Dễ', `guest reads settings read-only, theme "Theo bố cục" by default: ${kv0.join(' / ')}`);
  await A.click('#ui .lobby .th[data-k="lava"]');
  await until(B, '__G.online.lobby.theme === "lava"', 'B sees the theme');
  const kv = await B.evaluate(() => [...document.querySelectorAll('#ui .lobby .kv b')].map((b) => b.textContent));
  check(kv.join() === 'Chiếm điểm,Cảng Băng,Núi lửa,Dễ', `guest reads the chosen theme read-only: ${kv.join(' / ')}`);
  check(JSON.stringify(await model(A)) === JSON.stringify(await model(B)), 'both pages hold the identical lobby model');
  await sleep(300);
  await shot(A, 'host'); await shot(B, 'guest');
  await shot(A, 'chat-host'); await shot(B, 'chat-guest');

  // ---- phone-size lobby (A, 780x360), then back --------------------------------------------------------------------
  await A.setViewportSize({ width: 780, height: 360 }); await sleep(400);
  await shot(A, 'phone');
  const phoneOk = await A.evaluate(() => {
    const vw = innerWidth, vh = innerHeight, bad = [];
    for (const n of document.querySelectorAll('#ui .lobby *')) {
      if (n.closest('.lm-grid, .lb-teams, .opts, .lb-mine') && n.closest('.lm-grid, .lb-teams, .opts')) continue;
      const b = n.getBoundingClientRect(), cs = getComputedStyle(n);
      if (!b.width || !b.height || cs.display === 'none') continue;
      if (b.right > vw + 1 || b.bottom > vh + 1 || b.left < -1 || b.top < -1) bad.push(n.className || n.tagName);
    }
    return bad.slice(0, 5);
  });
  await shot(A, 'chat-phone');
  const phoneChat = await A.evaluate(() => { const r = document.querySelector('#ui .lobby .chatbox input').getBoundingClientRect(); return r.width > 120 && r.bottom <= innerHeight && r.right <= innerWidth && document.querySelectorAll('#ui .lobby .chatbox .cl').length === 2; });
  check(phoneChat, 'phone lobby: the chat input and both lines are on screen at 780x360');
  check(phoneOk.length === 0, 'phone lobby: nothing pokes out of 780x360' + (phoneOk.length ? ' ' + phoneOk.join(',') : ''));
  await A.setViewportSize({ width: 1280, height: 720 }); await sleep(300);

  // ---- start -----------------------------------------------------------------------------------------------------
  await A.click('#ui .lobby [data-a="start"]');
  await until(A, '__G.mode === "match"', 'A match running'); await until(B, '__G.mode === "match"', 'B match running');
  const ia = await info(A), ib = await info(B);
  check(ia.mode === 'match' && ib.mode === 'match', 'both pages reach __G.mode === "match"');
  check(ia.map === 'cangbang' && ib.map === 'cangbang' && ia.rule === 'chiem' && ib.rule === 'chiem', `same map ${ia.map} and mode ${ia.rule} on both`);
  check(ia.units === 10 && ib.units === 10, '10 units on both pages');
  const th = await Promise.all([A, B].map((p) => p.evaluate(() => __G.match.map.theme)));
  check(th.join() === 'lava,lava', `both matches use the host's theme: ${th.join(',')}`);
  // Joiners now default to the host's team, so B's slot is no longer fixed at 5: it only has to be its own, non-zero slot.
  check(ia.me === 0 && ib.me > 0 && ib.me === ib.mySlot && ib.name === 'Khách Hai' && ib.mech === 'ung' && ia.mech === 'trau', `A owns slot ${ia.me} (${ia.mech}), B owns slot ${ib.me} (${ib.mech}, "${ib.name}")`);
  const hudB = await B.evaluate(() => ({ weapon: document.querySelector('#ui .slot').title, me: document.querySelector('#ui .pc.me .pc-name').textContent, lobby: !!document.querySelector('#ui .lobby.on'), hud: !!document.querySelector('#ui .hud.on') }));
  check(hudB.weapon === MECHS.ung.weapon.name && hudB.me === 'Khách Hai' && !hudB.lobby && hudB.hud, `B's HUD shows its own mech (weapon "${hudB.weapon}")`);
  check((await A.evaluate('document.querySelector("#ui .slot").title')) === MECHS.trau.weapon.name, 'A\'s HUD shows A\'s mech');

  // ---- mirror tracks the host ------------------------------------------------------------------------------------
  await sleep(5000);
  const ha = await info(A), hb = await info(B), ha2 = await info(A);
  const near = dist(await posOf(A, ib.me), await posOf(B, ib.me));
  const sc = (x) => JSON.stringify(x.score);
  check(sc(hb) === sc(ha) || sc(hb) === sc(ha2), `scores after 5 s: A ${ha.score} then ${ha2.score}, B ${hb.score}`);
  check(hb.tick > 100 && Math.abs(ha.tick - hb.tick) < 30, `B's mirror follows A's clock (tick ${hb.tick} vs ${ha.tick})`);
  check(near <= 2, `B's unit on A is within 2 m of B's view (${near.toFixed(2)} m)`);

  // ---- esc opens the menu without pausing, label "Rời trận" --------------------------------------------------------
  await B.keyboard.press('Escape');
  await until(B, 'document.querySelector("#ui .pause.on")', 'pause menu on B');
  const t0 = (await info(B)).tick; await sleep(700); const t1 = (await info(B)).tick;
  const pz = await B.evaluate(() => ({ quit: document.querySelector('#ui .pause [data-r="quit"]').textContent, paused: !!__G.paused }));
  check(pz.quit === 'Rời trận' && !pz.paused && t1 > t0, `online Esc: button "${pz.quit}", game keeps running (tick ${t0} -> ${t1}, G.paused ${pz.paused})`);
  await B.keyboard.press('Escape');
  await until(B, '!document.querySelector("#ui .pause.on")', 'pause menu closed');

  // ---- a held key moves B's unit on A --------------------------------------------------------------------------------
  const before = await posOf(A, ib.me);
  await B.keyboard.down('KeyD'); await sleep(1500); await B.keyboard.up('KeyD');
  const after = await posOf(A, ib.me);
  check(after[0] - before[0] > 3, `holding D on B moved its unit ${(after[0] - before[0]).toFixed(1)} m along +x on A`);
  await sleep(500);
  check(dist(await posOf(A, ib.me), await posOf(B, ib.me)) <= 2, 'B\'s view and A agree on B\'s unit after the move');

  // ---- chat in the match: Enter opens it on B, typing d's does not walk B's unit, the line shows on A ---------------------
  const walkFrom = await posOf(A, ib.me);
  await B.keyboard.press('Enter');
  await until(B, 'document.querySelector("#ui .chatbox.in-match.open")', 'B chat box open');
  await B.keyboard.type('dddddddd');
  await sleep(700);
  check(dist(await posOf(A, ib.me), walkFrom) < 0.8, `typing d's in the chat box does not move B's unit on A (${dist(await posOf(A, ib.me), walkFrom).toFixed(2)} m)`);
  await B.fill('#ui .chatbox.in-match input', 'Đẩy trụ nào <i>x</i>');
  await B.keyboard.press('Enter');
  await until(A, '[...document.querySelectorAll("#ui .chatbox.in-match .cl span")].some((n) => n.textContent === "Đẩy trụ nào <i>x</i>")', 'B\'s match line on A');
  check(await A.evaluate(() => { const r = [...document.querySelectorAll('#ui .chatbox.in-match .cl')].pop(); return r.querySelector('b').textContent === 'Khách Hai' && r.querySelectorAll('span *').length === 0; }) && await B.evaluate('!document.querySelector("#ui .chatbox.in-match.open")'), 'the match line from B reads "Khách Hai: Đẩy trụ nào <i>x</i>" as text on A, and B\'s box closed after sending');
  await sleep(300);
  await shot(A, 'chat-match'); await shot(B, 'chat-match-guest');

  check((await errorsOf(A)).length === 0 && (await errorsOf(B)).length === 0, 'no window.__errors on A or B during the match');

  // ---- end the match -----------------------------------------------------------------------------------------------
  await A.evaluate('(() => { const m = __G.match; m.score[0] = m.target; })()');
  await until(A, '__G.mode === "result"', 'A result'); await until(B, '__G.mode === "result"', 'B result', 25000);
  await until(A, 'document.querySelector("#ui .result.on .rs-btns button")', 'A result buttons'); await until(B, 'document.querySelector("#ui .result.on .rs-btns button")', 'B result buttons');
  const btn = async (p) => p.evaluate(() => [...document.querySelectorAll('#ui .result.on .rs-btns button')].map((b) => b.textContent.trim()));
  const ba = await btn(A), bb = await btn(B);
  check(ba.join('|') === 'Về phòng' && bb.join('|') === 'Về phòng', `result screens: buttons "${ba.join('|')}" / "${bb.join('|')}", no "Đấu tiếp"`);
  await sleep(1800);
  await shot(A, 'result');

  // ---- back to the room --------------------------------------------------------------------------------------------
  await A.click('#ui .result [data-r="lobby"]'); await B.click('#ui .result [data-r="lobby"]');
  await until(A, 'document.querySelector("#ui .lobby.on") && __G.online.state === "lobby"', 'A back in the lobby');
  await until(B, 'document.querySelector("#ui .lobby.on") && __G.online.state === "lobby"', 'B back in the lobby');
  await until(A, 'document.querySelectorAll("#ui .lobby .seat:not(.bot)").length === 2', 'A lists both players again');
  await sleep(500);
  const ra = await seats(A), rb = await seats(B);
  check(JSON.stringify(norm(ra)) === JSON.stringify(norm(rb)) && ra.length === 2 && ra[0].name === 'Chủ Nhà' && ra[1].name === 'Khách Hai' && ra[1].mech === MECHS.ung.name,
    `back in the room: same players on both (${ra.map((s) => s.name + ':' + (s.ready ? 'sẵn sàng' : 'chưa')).join(', ')})`);
  check(!ra[1].ready && ra[0].ready, 'ready flags reset for the guest, the host stays ready');
  check(await A.evaluate('__G.mode !== "result" && !document.querySelector("#ui .result.on")') && await B.evaluate('!document.querySelector("#ui .result.on")'), 'result screens are closed');

  // ---- leaving ---------------------------------------------------------------------------------------------------
  await B.click('#ui .lobby [data-a="leave"]');
  await until(B, 'document.querySelector("#ui .menu.on") && !document.querySelector("#ui .lobby.on")', 'B back at the menu');
  await until(A, 'document.querySelectorAll("#ui .lobby .seat:not(.bot)").length === 1', 'A sees B leave');
  check((await B.evaluate('__G.online.state')) === 'off' && (await seats(A)).length === 1, 'B left: B is off, A lists only itself');
  await A.click('#ui .lobby [data-a="leave"]');
  await until(A, 'document.querySelector("#ui .menu.on") && !document.querySelector("#ui .lobby.on")', 'A back at the menu');

  check((await errorsOf(A)).length === 0 && (await errorsOf(B)).length === 0, 'no window.__errors on A or B at the end');
  check(problems.length === 0, 'no console errors or failed requests' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''));
  await br.close(); srv.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
