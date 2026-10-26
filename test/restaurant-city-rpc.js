#!/usr/bin/env node
// Restaurant City edge RPC (supabase/functions/rc-rpc) against the DEPLOYED function.
//   node test/restaurant-city-rpc.js
// Signs in (or signs up) two hub bot users rc-bot-a / rc-bot-b, calls /me,
// replays D:/rc-ref/capture.jsonl (a brand-new player's intro, recorded from the
// original server) as bot A, then checks a mail from A reaches B through the RPC
// (getMails + pollEvents). Node 22, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CAPTURE = process.env.RC_CAPTURE || 'D:/rc-ref/capture.jsonl';
const cfg = fs.readFileSync(path.join(ROOT, 'js/supabase-config.js'), 'utf8');
const SUPABASE_URL = /url:\s*"([^"]+)"/.exec(cfg)[1];
const ANON = /anonKey:\s*"([^"]+)"/.exec(cfg)[1];
const FN = `${SUPABASE_URL}/functions/v1/rc-rpc`;
// Throwaway test identities (no hub privileges).
// Mật khẩu bot không nằm trong repo (repo lên Pages công khai): RC_BOT_PASSWORD hoặc tệp ~/.rc-bot-password.
const BOT_PASSWORD = process.env.RC_BOT_PASSWORD || (() => {
  try { return require('fs').readFileSync(require('path').join(require('os').homedir(), '.rc-bot-password'), 'utf8').trim(); }
  catch (e) { throw new Error('bot password missing: set RC_BOT_PASSWORD or write ~/.rc-bot-password'); }
})();
const BOTS = { A: 'rc-bot-a', B: 'rc-bot-b' };

let failures = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
  return ok;
}

// ---- PlayFish wire helpers (same encoding as server/src/rpc/codec.ts) ----------
function readVarint(buf, pos) {
  let value = 0; let b;
  do {
    if (pos >= buf.length) throw new Error('EOF in varint');
    b = buf[pos++];
    value = (value * 128) + (b & 0x7f);
  } while (b & 0x80);
  return [value, pos];
}
function writeVarint(value) {
  let n = value >>> 0; const groups = [];
  do { groups.unshift(n & 0x7f); n = Math.floor(n / 128); } while (n > 0);
  for (let i = 0; i < groups.length - 1; i++) groups[i] |= 0x80;
  return Buffer.from(groups);
}
function writeString(s) { return Buffer.concat([writeVarint([...s].length), Buffer.from(s, 'utf8')]); }
function readString(buf, pos) {
  let n; [n, pos] = readVarint(buf, pos);
  const start = pos; let chars = 0;
  while (chars < n) { const b = buf[pos]; pos += b < 0x80 ? 1 : b >> 4 === 14 ? 3 : 2; chars++; }
  return [buf.subarray(start, pos).toString('utf8'), pos];
}
/** Split a batch response into [{msgType, body}]. */
function batchParts(resp) {
  let pos = 2; let count; [count, pos] = readVarint(resp, pos);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const msgType = resp[pos++]; let len; [len, pos] = readVarint(resp, pos);
    parts.push({ msgType, body: resp.subarray(pos, pos + len) }); pos += len;
  }
  return parts;
}
function batchSubTypes(req) {
  let pos = 2; let n; [n, pos] = readVarint(req, pos); pos += n; // session string (ASCII)
  pos += 1; // batch mode
  let count; [count, pos] = readVarint(req, pos);
  const types = [];
  for (let i = 0; i < count; i++) { types.push(req[pos++]); let len; [len, pos] = readVarint(req, pos); pos += len; }
  return types;
}
function replaceAll(buf, from, to) {
  if (!from || from.length !== to.length) return buf;
  const out = Buffer.from(buf);
  for (let i = out.indexOf(from); i >= 0; i = out.indexOf(from, i + to.length)) to.copy(out, i);
  return out;
}
function parsePoll(resp) {
  let pos = 2; let minPoll; let timeout; let count;
  [minPoll, pos] = readVarint(resp, pos); [timeout, pos] = readVarint(resp, pos); [count, pos] = readVarint(resp, pos);
  const events = [];
  for (let i = 0; i < count; i++) {
    let id; [id, pos] = readVarint(resp, pos); const type = resp[pos++];
    let len; [len, pos] = readVarint(resp, pos); events.push({ id, type, body: resp.subarray(pos, pos + len) }); pos += len;
  }
  return { minPoll, timeout, events };
}
function pollRequest(session, ackIds = []) {
  return Buffer.concat([Buffer.from([0, 247]), writeString(session), Buffer.from([0]), writeVarint(30000),
    writeVarint(ackIds.length), ...ackIds.map(writeVarint)]);
}

// ---- hub auth --------------------------------------------------------------------
async function authPost(pathname, body) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function botToken(name) {
  const email = `${name}@rc-bot.example.com`;
  let r = await authPost('/auth/v1/token?grant_type=password', { email, password: BOT_PASSWORD });
  if (r.status !== 200) {
    const s = await authPost('/auth/v1/signup', { email, password: BOT_PASSWORD, data: { display_name: name } });
    if (s.json.access_token) return s.json.access_token;
    r = await authPost('/auth/v1/token?grant_type=password', { email, password: BOT_PASSWORD });
  }
  if (!r.json.access_token) throw new Error(`hub sign-in failed for ${email}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  return r.json.access_token;
}

async function rpc(token, bytes) {
  const t0 = performance.now();
  const res = await fetch(FN, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, body, ms: Math.round(performance.now() - t0), error: res.headers.get('x-rc-error'), timing: res.headers.get('server-timing') || '' };
}
async function me(token) {
  const t0 = performance.now();
  const res = await fetch(`${FN}/me`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } });
  return { status: res.status, json: await res.json().catch(() => ({})), ms: Math.round(performance.now() - t0) };
}

async function main() {
  const capture = fs.readFileSync(CAPTURE, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const tokens = { A: await botToken(BOTS.A), B: await botToken(BOTS.B) };

  // Contract: bad token -> 401 JSON; OPTIONS answered with CORS.
  const bad = await fetch(FN, { method: 'POST', headers: { Authorization: 'Bearer nope', apikey: ANON }, body: Buffer.from([0, 254]) });
  const badJson = await bad.json().catch(() => ({}));
  check(bad.status === 401 && badJson.error === 'session expired', 'invalid token -> 401 session expired', `${bad.status}`);
  const pre = await fetch(FN, { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'POST' } });
  check(pre.ok && pre.headers.get('access-control-allow-origin') === '*', 'OPTIONS preflight', `${pre.status}`);

  const who = {};
  for (const k of ['A', 'B']) {
    const r = await me(tokens[k]);
    who[k] = r.json;
    check(r.status === 200 && r.json.ok && r.json.username && r.json.networkUid && r.json.playfishUid,
      `/me bot ${k}`, `${r.status} ${r.ms}ms ${JSON.stringify(r.json)}`);
  }
  if (!who.A.ok || !who.B.ok) throw new Error('/me failed; cannot continue');

  // ---- replay the captured intro as bot A ----------------------------------------
  const sessions = {};
  let capturedToken = null; let liveToken = null;
  const batchMs = [];
  for (const [i, entry] of capture.entries()) {
    let req = Buffer.from(entry.req, 'hex');
    if (capturedToken) req = replaceAll(req, capturedToken, liveToken);
    const r = await rpc(tokens.A, req);
    const label = `replay #${i + 1} ${entry.call}${entry.subs.length ? `[${entry.subs.map((s) => s.name).join(',')}]` : ''}`;
    if (!check(r.status === 200, `${label} HTTP 200`, `${r.status} ${r.body.toString('utf8', 0, 200)}`)) continue;
    const msgType = req[1];
    if (msgType === 255) {
      const want = batchSubTypes(req);
      const parts = batchParts(r.body);
      const allAnswered = parts.length === want.length && parts.every((p, j) => p.msgType === want[j]);
      check(r.body[0] === 0 && r.body[1] === 255 && allAnswered, `${label} envelope`,
        `${r.ms}ms subs=${parts.map((p) => p.msgType).join(',')} want=${want.join(',')}${r.error ? ` err=${r.error}` : ''} [${r.timing}]`);
      batchMs.push(r.ms);
      const init = parts.find((p) => p.msgType === 1);
      if (init) {
        const [token] = readString(init.body, 0);
        const capturedInit = batchParts(Buffer.from(entry.resp, 'hex')).find((p) => p.msgType === 1);
        capturedToken = Buffer.from(readString(capturedInit.body, 0)[0], 'utf8');
        liveToken = Buffer.from(token, 'utf8');
        sessions.A = token;
        check(token.length === capturedToken.length, 'init returned an RPC session token', `${token.length} chars`);
      }
      if (want.includes(3)) {
        check(r.body.includes(Buffer.from(who.A.username, 'utf8')), `${label} getUserProfile carries bot A username`, who.A.username);
      }
      const save = parts.find((p) => p.msgType === 5);
      if (save) check(save.body[0] === 0, `${label} saveProfile accepted by the save fence`, `status=${save.body[0]}`);
    } else {
      check(r.body[0] === 0 && r.body[1] === msgType, `${label} envelope`, `${r.ms}ms resp=${r.body.subarray(0, 8).toString('hex')}${r.error ? ` err=${r.error}` : ''}`);
      if (msgType === 247 && i === capture.findIndex((e) => e.call === 'pollEvents')) {
        const poll = parsePoll(r.body);
        check(poll.minPoll === 60000, 'async pollEvents minPollInterval 60000', `${poll.minPoll}`);
      }
    }
  }

  // ---- bot A's portrait (storeImage in the capture), public, no auth ----------------
  if (capture.some((e) => e.call === 'storeImage')) {
    const img = await fetch(`${FN}/profile-image/${encodeURIComponent(who.A.networkUid)}/1.png`);
    const png = Buffer.from(await img.arrayBuffer());
    check(img.status === 200 && img.headers.get('content-type') === 'image/png'
      && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      && img.headers.get('cache-control') === 'public, max-age=60' && img.headers.get('access-control-allow-origin') === '*',
    'bot A portrait /profile-image/<uid>/1.png is a PNG (no auth)', `${img.status} ${img.headers.get('content-type')} ${png.length} bytes`);
    const none = await fetch(`${FN}/profile-image/1/1.png`);
    await none.arrayBuffer();
    check(none.status === 404, 'portrait of a uid without stored image -> 404', `${none.status}`);
  }

  // ---- cross-player: A mails B, B sees it in getMails and pollEvents ---------------
  const bInit = await rpc(tokens.B, Buffer.from(capture[0].req, 'hex'));
  const bInitPart = batchParts(bInit.body).find((p) => p.msgType === 1);
  sessions.B = bInitPart ? readString(bInitPart.body, 0)[0] : '';
  check(bInit.status === 200 && sessions.B.length > 0, 'bot B init', `${bInit.ms}ms`);
  const bPoll0 = await rpc(tokens.B, pollRequest(sessions.B));
  const stale = bPoll0.status === 200 ? parsePoll(bPoll0.body).events.map((e) => e.id) : [];
  if (stale.length) await rpc(tokens.B, pollRequest(sessions.B, stale));

  const note = `rc-bot hello ${Date.now()}`;
  const recipient = Buffer.concat([writeVarint(2), writeString(who.B.networkUid), writeVarint(who.B.playfishUid)]);
  const sendMail = Buffer.concat([Buffer.from([0, 19]), writeString(sessions.A || ''), recipient,
    writeVarint(0), writeVarint(0), writeString(note), Buffer.from([1])]);
  const sent = await rpc(tokens.A, sendMail);
  check(sent.status === 200 && sent.body[0] === 0 && sent.body[1] === 19 && sent.body[2] === 0, 'A sendMail to B -> STATUS_OK',
    `${sent.ms}ms resp=${sent.body.toString('hex')}${sent.error ? ` err=${sent.error}` : ''}`);

  const mails = await rpc(tokens.B, Buffer.concat([Buffer.from([0, 20]), writeString(sessions.B)]));
  check(mails.status === 200 && mails.body[1] === 20 && mails.body.includes(Buffer.from(note, 'utf8')), 'B getMails contains the mail from A', `${mails.ms}ms`);

  const bPoll = await rpc(tokens.B, pollRequest(sessions.B));
  const events = bPoll.status === 200 ? parsePoll(bPoll.body).events : [];
  const mailEvent = events.find((e) => e.type === 2);
  check(Boolean(mailEvent) && mailEvent.body[0] === 1, 'B pollEvents carries a mail event (type 2, mail type 1)',
    `${bPoll.ms}ms events=${JSON.stringify(events.map((e) => ({ id: e.id, type: e.type, body: e.body.toString('hex') })))}`);
  if (mailEvent) {
    await rpc(tokens.B, pollRequest(sessions.B, events.map((e) => e.id)));
    const after = await rpc(tokens.B, pollRequest(sessions.B));
    check(parsePoll(after.body).events.length === 0, 'B pollEvents after ack is empty');
  }

  const sorted = [...batchMs].sort((a, b) => a - b);
  console.log(`batch latency ms: first=${batchMs[0]} median=${sorted[Math.floor(sorted.length / 2)]} all=${batchMs.join(',')}`);
  console.log(failures ? `FAIL ${failures} check(s) failed` : 'PASS all checks');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.log(`FAIL ${error.stack || error}`);
  process.exit(1);
});
