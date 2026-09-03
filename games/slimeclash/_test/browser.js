/*
 * Kiểm thật trên Chrome headless, không cần cài gói nào.
 *   node _test/browser.js
 *
 * Dùng CDP qua WebSocket có sẵn của Node 22. Việc nó làm:
 *   1. Mở index.html bằng file://, bắt mọi lỗi JS và console.error.
 *   2. Bấm "Vào trận", kiểm bàn cờ có mọc ra 72 ô không.
 *   3. KÉO một quân sang cột khác bằng sự kiện chuột thật của trình duyệt
 *      (CDP Input.dispatchMouseEvent sinh ra pointerdown/move/up thật) rồi
 *      kiểm số bước có giảm và bàn cờ có đổi không.
 *   4. Chụp màn hình nhà + màn hình trận ra _test/shot-*.png.
 *
 * Vì sao cần: mọi thứ trước đó chỉ kiểm được cú pháp và id, không chứng minh
 * được thao tác kéo có chạy trên trình duyệt thật hay không.
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 9333;
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

if (!CHROME) { console.error('Không tìm thấy Chrome/Edge'); process.exit(2); }

const fails = [];
const notes = [];
function check(ok, msg) { (ok ? notes : fails).push((ok ? 'OK   ' : 'LỖI  ') + msg); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'slimeclash-'));
  const url = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--allow-file-access-from-files', '--window-size=390,844',
    '--force-device-scale-factor=1', url,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      target = list.find((t) => t.type === 'page' && t.url.startsWith('file:'));
    } catch (e) { /* chưa lên */ }
  }
  if (!target) { chrome.kill(); throw new Error('Chrome không mở được cổng debug'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let id = 0;
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const send = (method, params = {}) => new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Runtime.evaluate', { expression: 'location.reload()' });
  await sleep(1500);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  // --- 1. nạp script và không có lỗi -------------------------------------
  const boot = await evalJs(`JSON.stringify({
    cfg: !!window.CFG, roster: (window.SLIME_ROSTER||[]).length,
    heroes: (window.DATA&&DATA.HEROES||[]).length, art: (window.Atlas&&Atlas.count())||0,
    eng: !!window.SlimeEngine, ui: !!window.SlimeUI
  })`);
  const b = JSON.parse(boot);
  check(b.cfg && b.eng && b.ui, 'script nạp đủ');
  check(b.roster === 96, 'roster 96 hero (thấy ' + b.roster + ')');
  check(b.heroes === 96, 'DATA.HEROES 96 (thấy ' + b.heroes + ')');
  check(b.art === 238, 'asset-map 238 khoá ảnh = 96 dải cấp + 94 chân dung + 48 quái (thấy ' + b.art + ')');

  // main.js chạy bất đồng bộ (SAVE.load) — chờ nó dựng xong màn hình nhà
  await sleep(600);
  const homeReady = await evalJs(`document.getElementById('pl-power').textContent`);
  check(/\d/.test(homeReady || ''), 'màn hình nhà đã render (lực chiến = "' + homeReady + '")');

  const errs = events.filter((e) =>
    e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map((e) => e.params.entry.text);
  const realErrs = errs.filter((t) => !/save-sync|supabase-config|net::ERR_FILE_NOT_FOUND/.test(t));
  check(realErrs.length === 0, 'không lỗi console' + (realErrs.length ? ': ' + realErrs[0] : ''));

  await send('Page.captureScreenshot', {}).then((r) =>
    fs.writeFileSync(path.join(__dirname, 'shot-home.png'), Buffer.from(r.result.data, 'base64')));

  // --- 2. vào trận -------------------------------------------------------
  await evalJs(`document.getElementById('btn-fight').click()`);
  await sleep(400);
  const cells = await evalJs(`document.querySelectorAll('#board-mine .cell').length`);
  check(cells === 36, 'bàn của mình có 36 ô (thấy ' + cells + ')');
  // KHÔNG được còn bàn địch: quái là MỘT con, có bảng riêng.
  const foeBoard = await evalJs(`document.querySelectorAll('#board-foe').length`);
  check(foeBoard === 0, 'không còn sân địch (thấy ' + foeBoard + ')');
  const withArt = await evalJs(`document.querySelectorAll('#board-mine .cell.has-art').length`);
  check(withArt > 10, 'ô có hình quân: ' + withArt + '/36');
  const foePanel = JSON.parse(await evalJs(`JSON.stringify({
    name: document.getElementById('foe-name').textContent,
    hp: document.getElementById('foe-hp-txt').textContent,
    art: !!document.getElementById('foe-art').style.backgroundImage,
    intent: document.getElementById('foe-intent').textContent
  })`));
  check(foePanel.name && foePanel.name !== 'Quái', 'quái có tên: "' + foePanel.name + '"');
  check(/\d+ \/ \d+/.test(foePanel.hp), 'quái có thanh máu: ' + foePanel.hp);
  check(foePanel.art, 'quái có hình');
  check(/cột/.test(foePanel.intent), 'quái báo trước cột sẽ đánh: ' + foePanel.intent);
  const threat = await evalJs(`document.querySelectorAll('#board-mine .cell.threat').length`);
  check(threat === 6, 'cột bị nhắm được đánh dấu (' + threat + ' ô)');

  // --- 3. KÉO THẢ --------------------------------------------------------
  // tìm một ô rảnh và một cột đích khác cột của nó
  const pick = JSON.parse(await evalJs(`(function(){
    var cells = document.querySelectorAll('#board-mine .cell');
    for (var i = 0; i < cells.length; i++) {
      var el = cells[i];
      if (el.classList.contains('empty')) continue;        // phải là ô CÓ quân
      var c = parseInt(el.dataset.c, 10), r0 = parseInt(el.dataset.r, 10);
      if (c >= 5) continue;                                // cần một ô kề bên phải
      var dst = document.querySelector('#board-mine .cell[data-r="' + r0 +
                                       '"][data-c="' + (c + 1) + '"]');
      if (!dst) continue;
      // Ô đích phải KHÁC ô nguồn, nếu không đổi chỗ hai quân y hệt nhau thì bàn cờ
      // trông không đổi gì và phép kiểm "bàn cờ ĐỔI" báo sai.
      if ((dst.title || '') === (el.title || '')) continue;
      var a = el.getBoundingClientRect(), b = dst.getBoundingClientRect();
      return JSON.stringify({
        ok: true, x: a.left + a.width/2, y: a.top + a.height/2,
        tx: b.left + b.width/2, ty: b.top + b.height/2, col: c, target: c + 1
      });
    }
    return JSON.stringify({ok:false});
  })()`));
  check(pick.ok, 'tìm được quân để kéo sang ô kề');

  if (pick.ok) {
    const before = JSON.parse(await evalJs(`(function(){
      var c = document.querySelectorAll('#board-mine .cell');
      var s = ''; for (var i=0;i<c.length;i++) s += c[i].className + '|' + (c[i].title||'') + ';';
      return JSON.stringify({ steps: document.getElementById('hud-step').textContent, board: s });
    })()`));

    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent',
      Object.assign({ type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1,
                      pointerType: 'mouse' }, extra));

    await mouse('mousePressed', pick.x, pick.y);
    await sleep(60);
    // kéo từ từ để vượt ngưỡng 8px rồi sang cột đích
    for (let i = 1; i <= 6; i++) {
      await mouse('mouseMoved', pick.x + (pick.tx - pick.x) * i / 6, pick.ty);
      await sleep(40);
    }
    const ghost = await evalJs(`document.querySelectorAll('.drag-ghost').length`);
    check(ghost === 1, 'ghost hiện khi kéo (thấy ' + ghost + ')');
    const hi = await evalJs(`document.querySelectorAll('#board-mine .cell.dropto').length`);
    check(hi === 1, 'ô đích sáng lên khi kéo (thấy ' + hi + ')');

    await send('Page.captureScreenshot', {}).then((r) =>
      fs.writeFileSync(path.join(__dirname, 'shot-drag.png'), Buffer.from(r.result.data, 'base64')));

    await mouse('mouseReleased', pick.tx, pick.ty);
    await sleep(300);

    const after = JSON.parse(await evalJs(`(function(){
      var c = document.querySelectorAll('#board-mine .cell');
      var s = ''; for (var i=0;i<c.length;i++) s += c[i].className + '|' + (c[i].title||'') + ';';
      return JSON.stringify({ steps: document.getElementById('hud-step').textContent, board: s,
                              ghost: document.querySelectorAll('.drag-ghost').length });
    })()`));

    check(after.ghost === 0, 'ghost biến mất sau khi thả');
    check(after.board !== before.board, 'bàn cờ ĐỔI sau khi kéo');
    check(after.steps !== before.steps,
      'số bước giảm: ' + before.steps + ' -> ' + after.steps);
  }

  await send('Page.captureScreenshot', {}).then((r) =>
    fs.writeFileSync(path.join(__dirname, 'shot-battle.png'), Buffer.from(r.result.data, 'base64')));

  // --- 4. hết bước -> bấm Đánh -> quân bắn, quái mất máu ------------------
  const hpBefore = await evalJs(`document.getElementById('foe-hp').style.width`);
  await evalJs(`document.getElementById('btn-end').click()`);
  await sleep(400);
  const afterTurn = JSON.parse(await evalJs(`JSON.stringify({
    hp: document.getElementById('foe-hp').style.width,
    turnNote: document.getElementById('mid-note').textContent,
    steps: document.getElementById('hud-step').textContent
  })`));
  check(afterTurn.hp !== hpBefore,
    'bấm Đánh thì quái mất máu (' + hpBefore + ' -> ' + afterTurn.hp + ')');
  check(afterTurn.steps === String(3), 'sang lượt mới thì bước được nạp lại (' +
    afterTurn.steps + ')');

  // --- 5. chiều cao có tràn màn hình không -------------------------------
  const overflow = JSON.parse(await evalJs(`JSON.stringify({
    doc: document.documentElement.scrollHeight, win: window.innerHeight
  })`));
  check(overflow.doc <= overflow.win + 8,
    'màn trận vừa 1 màn hình (' + overflow.doc + ' / ' + overflow.win + ')');

  ws.close();
  chrome.kill();
  await sleep(200);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
}

main().then(() => {
  notes.forEach((n) => console.log(n));
  fails.forEach((f) => console.log(f));
  console.log('');
  console.log(fails.length ? 'CÓ ' + fails.length + ' LỖI' : 'TẤT CẢ QUA');
  process.exit(fails.length ? 1 : 0);
}).catch((e) => {
  console.error('không chạy được:', e.message);
  process.exit(2);
});
