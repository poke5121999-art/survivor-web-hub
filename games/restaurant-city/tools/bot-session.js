'use strict';
// node bot-session.js <tên-bot>: in JSON HubSession của bot <tên>@rc-bot.example.com (đăng ký lần đầu).
// Mật khẩu bot đọc từ RC_BOT_PASSWORD hoặc ~/.rc-bot-password, không nằm trong repo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = fs.readFileSync(path.join(__dirname, '../../../js/supabase-config.js'), 'utf8');
const URL_ = /url:\s*"([^"]+)"/.exec(cfg)[1];
const ANON = /anonKey:\s*"([^"]+)"/.exec(cfg)[1];
const PW = (process.env.RC_BOT_PASSWORD || fs.readFileSync(path.join(os.homedir(), '.rc-bot-password'), 'utf8')).trim();
const bot = process.argv[2];
if (!bot) { console.error('usage: node bot-session.js <bot-name>'); process.exit(2); }
const email = bot + '@rc-bot.example.com';
const post = (p, b) => fetch(URL_ + p, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
  .then(async (r) => ({ s: r.status, d: await r.json() }));
(async () => {
  let r = await post('/auth/v1/token?grant_type=password', { email, password: PW });
  if (r.s !== 200) {
    await post('/auth/v1/signup', { email, password: PW, data: { display_name: bot } });
    r = await post('/auth/v1/token?grant_type=password', { email, password: PW });
  }
  if (r.s !== 200) { console.error('sign-in failed: ' + JSON.stringify(r.d)); process.exit(1); }
  const d = r.d;
  process.stdout.write(JSON.stringify({ kind: 'member', userId: d.user.id, email, name: bot, accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: d.expires_at * 1000 }));
})();
