// Host loses its relay link (as a throttled background tab or a network blip does), then a guest joins from the room
// list. Before the fix the lobby kept a dead join code and the guest got "relay join: HTTP 404 join code not found".
// Real Unity Relay. BZ_BASE=<Pages url> tests the pushed build.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/coop-relink.js
'use strict';
const { serve } = require('../../../tools/thumb-lib.js');
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const BASE = process.env.BZ_BASE;
const kill = setTimeout(() => { console.log('FAIL hard timeout'); process.exit(2); }, 150000);
(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'd@t' }));
    const WS = window.WebSocket; window.__ws = [];
    window.WebSocket = function (...a) { const w = new WS(...a); window.__ws.push(w); return w; };
    window.WebSocket.prototype = WS.prototype; Object.assign(window.WebSocket, { OPEN: 1, CLOSED: 3 });
  });
  const A = await ctx.newPage(); const B = await ctx.newPage();
  const logs = [];
  for (const [n, p] of [['A', A], ['B', B]]) p.on('pageerror', (e) => logs.push(n + ' PAGEERR ' + e.message));
  const url = (BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&seed=3&nolock=1&noaudio=1&god=0&v=' + Date.now();
  await A.goto(url); await B.goto(url.replace('seed=3', 'seed=4'));
  await A.waitForFunction('window.__ready === true'); await B.waitForFunction('window.__ready === true');
  await A.evaluate("__G.settings.coopName = 'Chu'; __G.events.emit('ui:coophost')");
  await A.waitForFunction("__G.state === 'select'", null, { timeout: 30000 });
  const code = await A.evaluate('__G.coop.code');
  await A.evaluate('__select.pick(3); __select.go()');
  console.log('room', code);
  // drop the host's relay socket and stay silent past the relay's 10 s idle limit
  const n = await A.evaluate(() => { let k = 0; for (const w of window.__ws) if (w.url.startsWith('wss://') && w.readyState === 1) { w.close(); k++; } return k; });
  check(n >= 1, `host relay socket closed (${n})`);
  await A.waitForTimeout(14000);
  await B.evaluate(`__G.settings.coopName = 'Khach'; window.__err = ''; __G.events.emit('ui:coopjoin', { code: '${code}' })`);
  let joined = false;
  try { await B.waitForFunction("__G.state === 'select'", null, { timeout: 30000 }); joined = true; } catch (e) { /* reported below */ }
  const status = await B.evaluate("({ st: __G.state, guest: __G.coop.guest, status: __G.coop.status, txt: (document.body.innerText.match(/Can.t[^\\n]*|Không[^\\n]*/) || [''])[0].slice(0, 200) })");
  console.log('guest', JSON.stringify(status));
  check(joined && status.guest, 'guest joins the room after the host lost its relay link');
  if (joined) {
    await B.evaluate('__select.pick(4); __select.go()');
    await A.waitForTimeout(4000);
    const a = await A.evaluate('({ av: [...__G.coop.avatars.keys()] })');
    check(a.av.length === 1, `host sees the guest after relink (${JSON.stringify(a.av)})`);
  }
  for (const l of logs) console.log(l);
  await A.evaluate("__G.coop.stop && __G.coop.stop()").catch(() => {});
  await br.close(); srv.close && srv.close(); clearTimeout(kill);
  console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + e.message); process.exit(1); });
