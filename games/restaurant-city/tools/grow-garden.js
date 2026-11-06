'use strict';
// node grow-garden.js <tên-bot> [giờ]: tua vườn của bot <tên>@rc-bot.example.com thêm [giờ] (mặc định 48 = chín ngay).
// Gọi POST rc-rpc/dev/grow-garden; chỉ email nằm trong secret RC_DEV_EMAILS của function mới được tua.
// Game chỉ đọc vườn lúc tải, nên tải lại trang sau khi tua.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cfg = fs.readFileSync(path.join(__dirname, '../../../js/supabase-config.js'), 'utf8');
const URL_ = /url:\s*"([^"]+)"/.exec(cfg)[1];
const ANON = /anonKey:\s*"([^"]+)"/.exec(cfg)[1];
const [bot, hours] = process.argv.slice(2);
if (!bot) { console.error('usage: node grow-garden.js <bot-name> [hours]'); process.exit(2); }
const session = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'bot-session.js'), bot], { encoding: 'utf8' }));
(async () => {
  const res = await fetch(`${URL_}/functions/v1/rc-rpc/dev/grow-garden`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(hours === undefined ? {} : { seconds: Math.round(Number(hours) * 3600) }),
  });
  const body = await res.json();
  console.log(res.status, JSON.stringify(body));
  if (!res.ok) process.exit(1);
})();
