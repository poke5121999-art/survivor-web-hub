/*
 * Restaurant City (games/restaurant-city): mở trang game bằng một tài khoản hub thật, để Ruffle nạp game.swf,
 * gọi RPC thật qua Edge Function rc-rpc, rồi kiểm mọi request đều thành công và màn chơi không trống.
 * Sau đó mở một social link (lời mời kết bạn do rc-bot-a tạo) khi chưa đăng nhập và khi đã đăng nhập.
 *
 *   node test/restaurant-city-play.js                     # máy chủ tĩnh trên gốc repo, function thật trên Supabase
 *   RC_URL=https://poke5121999-art.github.io/survivor-web-hub node test/restaurant-city-play.js
 *   RC_BOT=rc-bot-c (tài khoản bot) · RC_SHOTS=<thư mục ảnh> · RC_BOOT_MS=60000
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const SHOTS = process.env.RC_SHOTS || path.join(os.tmpdir(), 'restaurant-city-shots');
const BOT = process.env.RC_BOT || 'rc-bot-c';
// Mật khẩu bot không nằm trong repo (repo lên Pages công khai): RC_BOT_PASSWORD hoặc tệp ~/.rc-bot-password.
const BOT_PASSWORD = process.env.RC_BOT_PASSWORD || (() => {
  try { return require('fs').readFileSync(require('path').join(require('os').homedir(), '.rc-bot-password'), 'utf8').trim(); }
  catch (e) { throw new Error('bot password missing: set RC_BOT_PASSWORD or write ~/.rc-bot-password'); }
})();
const BOOT_MS = +(process.env.RC_BOOT_MS || 60000);

const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/supabase-config.js'), 'utf8');
const SUPA_URL = /url:\s*"([^"]+)"/.exec(cfgSrc)[1];
const ANON = /anonKey:\s*"([^"]+)"/.exec(cfgSrc)[1];

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
  return !!ok;
}

function serve() {
  if (process.env.RC_URL) return Promise.resolve({ base: process.env.RC_URL.replace(/\/$/, ''), close() {} });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash', '.xml': 'application/xml', '.png': 'image/png' };
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.stat(f, (err, st) => {
        if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Content-Length': st.size });
        fs.createReadStream(f).pipe(res);
      });
    }).listen(0, '127.0.0.1', () => resolve({ base: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

async function authPost(p, body) {
  const r = await fetch(SUPA_URL + p, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function botSession(bot = BOT) {
  const email = `${bot}@rc-bot.example.com`;
  let r = await authPost('/auth/v1/token?grant_type=password', { email, password: BOT_PASSWORD });
  if (r.status !== 200) {
    await authPost('/auth/v1/signup', { email, password: BOT_PASSWORD, data: { display_name: bot } });
    r = await authPost('/auth/v1/token?grant_type=password', { email, password: BOT_PASSWORD });
  }
  if (r.status !== 200) throw new Error('bot sign-in failed: ' + JSON.stringify(r.data).slice(0, 200));
  const d = r.data;
  return { kind: 'member', userId: d.user.id, email, name: bot, accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: (d.expires_at || Math.floor(Date.now() / 1000) + 3600) * 1000 };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { chromium } = require(PW);
  const server = await serve();
  const session = await botSession();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
    await ctx.addInitScript((s) => { try { localStorage.setItem('hub.session.v1', s); } catch (e) { /* storage blocked */ } }, JSON.stringify(session));
    const page = await ctx.newPage();
    const errors = [];
    const rpc = { ok: 0, bad: [] };
    const assets = { ok: 0, bad: [] };
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      const u = r.url();
      if (/\/functions\/v1\/rc-rpc/.test(u) && r.request().method() === 'POST') (r.status() === 200 ? rpc.ok++ : rpc.bad.push(r.status() + ' ' + u));
      else if (/\/games\/restaurant-city\//.test(u)) (r.status() < 400 ? assets.ok++ : assets.bad.push(r.status() + ' ' + u));
      else if (/\/functions\/v1\/rc-rpc\/profile-image\//.test(u) && r.status() >= 500) rpc.bad.push(r.status() + ' ' + u);
    });

    console.log('Restaurant City @ ' + server.base + ' as ' + BOT);
    await page.goto(server.base + '/games/restaurant-city/index.html');
    await page.waitForFunction(() => /Chủ quán: /.test(document.getElementById('who').textContent), null, { timeout: 60000 })
      .then(() => check('/me answered, header shows the restaurant owner', true), () => check('/me answered, header shows the restaurant owner', false));
    check('login panel not shown to a signed-in member', await page.locator('#loginLink').isHidden());

    await page.waitForTimeout(BOOT_MS);
    await page.mouse.click(550, 700);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(SHOTS, 'rc-play.png') });

    const lit = await page.evaluate(() => {
      const p = document.querySelector('#stage ruffle-player, #stage ruffle-object');
      return !!p && document.getElementById('panel').classList.contains('hidden');
    });
    check('Ruffle player mounted and loading panel hidden', lit);
    check('RPC POSTs answered 200', rpc.ok >= 3 && rpc.bad.length === 0, rpc.ok + ' ok' + (rpc.bad.length ? '; ' + rpc.bad.slice(0, 3).join(' | ') : ''));
    check('game files load without 4xx/5xx', assets.ok >= 10 && assets.bad.length === 0, assets.ok + ' ok' + (assets.bad.length ? '; ' + assets.bad.slice(0, 3).join(' | ') : ''));
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | ') || null);

    const shot = fs.readFileSync(path.join(SHOTS, 'rc-play.png'));
    check('screenshot is not a blank stage', shot.length > 30000, shot.length + ' bytes, ' + path.join(SHOTS, 'rc-play.png'));

    const inviter = await botSession('rc-bot-a');
    const made = await fetch(SUPA_URL + '/functions/v1/rc-rpc/social-links', {
      method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + inviter.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'friendInvite' }),
    }).then((r) => r.json());
    if (check('rc-bot-a creates a friend-invite link', /^[A-Za-z0-9_-]{32}$/.test(made.slug || ''), JSON.stringify(made))) {
      const linkUrl = server.base + '/games/restaurant-city/index.html?link=' + made.slug;
      const anon = await (await browser.newContext()).newPage();
      await anon.goto(linkUrl);
      await anon.waitForSelector('#loginLink:not(.hidden)', { timeout: 30000 }).catch(() => null);
      check('a signed-out visitor is asked to sign in to accept the link',
        await anon.locator('#loginLink').isVisible() && /link Restaurant City/.test(await anon.locator('#panelText').textContent()));
      const card = await ctx.newPage();
      await card.goto(linkUrl);
      const shown = await card.waitForFunction(() => /Đồng ý/.test(document.querySelector('#linkCard').textContent), null, { timeout: 60000 })
        .then(() => true, () => false);
      check('a member sees the invite card with an accept button', shown && await card.locator('#linkCard h1').textContent() === 'Lời mời kết bạn trong Restaurant City',
        (await card.locator('#linkCard').textContent()).slice(0, 120));
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
