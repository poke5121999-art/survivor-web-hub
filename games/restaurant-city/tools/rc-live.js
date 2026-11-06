'use strict';
// Phiên chơi sống: mở trang game trong Chromium headless rồi chờ lệnh, để một agent tự chơi từng bước.
// Lệnh ghi thêm vào <OUT>/cmd.txt (tools/rcc.sh làm hộ), mỗi dòng "<id> <op> <args>":
//   c x y          bấm tại toạ độ game 760x600
//   d x1 y1 x2 y2  kéo
//   t text         gõ chữ        k Key   bấm phím (Enter, Escape...)
//   w ms           chờ           r       tải lại trang      q   thoát
//   e expr         chạy biểu thức JS trong trang, ghi kết quả (JSON) vào log
// Sau mỗi lệnh: chụp <OUT>/live-<id>.png, ghi <OUT>/ack.txt = id.
// <OUT>/log.txt ghi tên từng RPC (giải mã từ body), status, x-rc-error và sub nào server không trả lời.
//
// RC_URL=<trang game> RC_SESSION=<JSON HubSession, xem tools/bot-session.js> [RC_OUT=D:/rc-ref/live] node rc-live.js
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const OUT = process.env.RC_OUT || 'D:/rc-ref/live';
const URL_ = process.env.RC_URL;
const SESSION = process.env.RC_SESSION;
const MAX_MS = Number(process.env.RC_MAX_MS || 3 * 60 * 60 * 1000);
if (!URL_ || !SESSION) { console.error('rc-live: RC_URL and RC_SESSION are not set'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const CMD = path.join(OUT, 'cmd.txt');
fs.writeFileSync(CMD, '');
fs.writeFileSync(path.join(OUT, 'ack.txt'), '0');
const log = (s) => fs.appendFileSync(path.join(OUT, 'log.txt'), new Date().toISOString().slice(11, 19) + ' ' + s + '\n');

// Same table as server/src/rpc/calls.ts.
const CALLS = {
  0: 'ERROR', 1: 'init', 2: 'getAllFriends', 3: 'getUserProfile', 4: 'getUsers', 5: 'saveProfile', 17: 'swapIngredient',
  19: 'sendMail', 20: 'getMails', 25: 'quizzReply', 32: 'buyMystryBox', 34: 'storeImage', 35: 'rankRestaurant',
  36: 'firstTimeVisitFriend', 37: 'getRandomStreetUsers', 38: 'getGourmetStreetUsers', 39: 'getHireCandidates',
  40: 'purchaseCoinsWithPfCash', 41: 'purchaseCashItem', 42: 'purchaseCashItemIngredients', 43: 'waterFriendGarden',
  44: 'readBookmarkCount', 45: 'writeBookmarkCount', 46: 'sendNotification', 246: 'getPricepoints', 247: 'pollEvents',
  248: 'getCashBalance', 249: 'getServerTime', 250: 'getPurchasableItems', 251: 'recordGameEvent', 253: 'getTimeToken0',
  254: 'ping', 255: 'batchOperation',
};
const name = (t) => CALLS[t] || 'type_' + t;

function varint(buf, pos) {
  let v = 0; let b;
  do { b = buf[pos++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80);
  return [v >>> 0, pos];
}

// Request: [encap][msgType][session string]; batch adds [mode][count] then [type][len][body] per sub.
function requestCalls(buf) {
  try {
    if (!buf || buf.length < 2) return [];
    const type = buf[1];
    let [len, pos] = varint(buf, 2);
    pos += len;
    if (type !== 255) return [name(type)];
    pos += 1;
    let count; [count, pos] = varint(buf, pos);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const t = buf[pos++]; let n; [n, pos] = varint(buf, pos); pos += n; out.push(name(t));
    }
    return out;
  } catch (e) { return ['?']; }
}

// Response: [0][msgType] or [0][255][count] then [type][len][body]; type 0 = not answered.
function unanswered(buf, calls) {
  try {
    if (buf[1] === 0) return calls;
    if (buf[1] !== 255) return [];
    let [count, pos] = varint(buf, 2);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const t = buf[pos++]; let n; [n, pos] = varint(buf, pos); pos += n;
      if (t === 0) out.push(calls[i] || '#' + i);
    }
    return out;
  } catch (e) { return ['?']; }
}

(async () => {
  // RC_ANGLE=d3d11 renders on the GPU (closer to a player's machine than the default software SwiftShader).
  const angle = process.env.RC_ANGLE || 'swiftshader';
  const browser = await chromium.launch({ headless: true, args: angle === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=' + angle, '--enable-gpu', '--ignore-gpu-blocklist'] });
  setTimeout(() => { log('max time reached, quitting'); browser.close().finally(() => process.exit(3)); }, MAX_MS).unref();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  await ctx.addInitScript((s) => { try { localStorage.setItem('hub.session.v1', s); } catch (e) { /* storage blocked */ } }, SESSION);
  // RC_RUFFLE_LOG=info makes Ruffle print AS3 trace() output (default level drops it).
  if (process.env.RC_RUFFLE_LOG) {
    // index.html assigns RufflePlayer.config wholesale, so merge the level in on every assignment.
    await ctx.addInitScript((level) => {
      let config = { logLevel: level };
      window.RufflePlayer = window.RufflePlayer || {};
      Object.defineProperty(window.RufflePlayer, 'config', { configurable: true, get: () => config, set: (v) => { config = Object.assign({}, v, { logLevel: level }); } });
    }, process.env.RC_RUFFLE_LOG);
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror ' + e.message));
  // Ruffle reports uncaught AS3 errors (and AVM warnings) on the console, not as page errors.
  page.on('console', (m) => { if (process.env.RC_RUFFLE_LOG || m.type() === 'error' || /Error #?\d|TypeError|ReferenceError/.test(m.text())) log('console ' + m.type() + ' ' + m.text().slice(0, 300)); });
  page.on('response', async (r) => {
    const u = r.url();
    if (/rc-rpc\/social-links/.test(u)) {
      log('social ' + r.request().method() + ' ' + r.status() + ' ' + u.replace(/^.*\/social-links/, '').replace(/\?.*$/, ''));
    } else if (/rc-rpc/.test(u) && r.request().method() === 'POST') {
      const calls = requestCalls(r.request().postDataBuffer());
      let body = null;
      try { body = await r.body(); } catch (e) { /* page closed */ }
      const miss = body ? unanswered(body, calls) : [];
      const err = r.headers()['x-rc-error'];
      log('rpc ' + r.status() + ' ' + calls.join(',') + (miss.length ? ' UNANSWERED=' + miss.join(',') : '') + (err ? ' err=' + err : ''));
    } else if (r.status() >= 400) {
      log('http ' + r.status() + ' ' + u);
    }
  });
  await page.goto(URL_);
  log('loaded ' + URL_);
  async function toPage(x, y) {
    const b = await page.locator('#stage').boundingBox();
    const k = (b.width - 10) / 760;
    return [b.x + 5 + x * k, b.y + 5 + y * k];
  }
  let done = 0;
  for (;;) {
    const lines = fs.readFileSync(CMD, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const [id, op, ...a] = line.trim().split(/\s+/);
      if (+id <= done) continue;
      const n = a.map(Number);
      try {
        if (op === 'c') {
          const [x, y] = await toPage(n[0], n[1]);
          await page.mouse.move(x - 4, y - 4); await page.waitForTimeout(150);
          await page.mouse.move(x, y, { steps: 4 }); await page.waitForTimeout(250);
          await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
          await page.waitForTimeout(1500);
        } else if (op === 'd') {
          const [x1, y1] = await toPage(n[0], n[1]);
          const [x2, y2] = await toPage(n[2], n[3]);
          await page.mouse.move(x1, y1, { steps: 3 }); await page.waitForTimeout(200);
          await page.mouse.down(); await page.waitForTimeout(200);
          await page.mouse.move(x2, y2, { steps: 15 }); await page.waitForTimeout(200);
          await page.mouse.up(); await page.waitForTimeout(1500);
        } else if (op === 't') {
          await page.keyboard.type(a.join(' '), { delay: 60 }); await page.waitForTimeout(500);
        } else if (op === 'k') {
          await page.keyboard.press(a[0]); await page.waitForTimeout(800);
        } else if (op === 'e') {
          const value = await page.evaluate((src) => (0, eval)(src), line.trim().split(/\s+/).slice(2).join(' '));
          log('= ' + JSON.stringify(value));
        } else if (op === 'w') {
          await page.waitForTimeout(n[0]);
        } else if (op === 'r') {
          await page.reload(); log('reloaded');
        } else if (op === 'q') {
          log('quit'); fs.writeFileSync(path.join(OUT, 'ack.txt'), id); await browser.close(); process.exit(0);
        }
        log('> ' + line);
      } catch (e) { log('error ' + line + ' ' + e.message); }
      await page.screenshot({ path: path.join(OUT, 'live-' + id + '.png') });
      done = +id;
      fs.writeFileSync(path.join(OUT, 'ack.txt'), String(done));
    }
    await page.waitForTimeout(300);
  }
})().catch((e) => { log('fatal ' + e.message); process.exit(1); });
