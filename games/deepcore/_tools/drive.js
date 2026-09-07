/*
 * drive.js — lái Chrome headless bằng CDP, không cài thêm gói nào.
 *
 * Vì sao tự viết thay vì dùng puppeteer: máy này không có sẵn puppeteer, mà cài
 * thêm gói vào một repo tĩnh thuần HTML/JS thì đổi cả tính chất của repo. Node
 * 22 đã có WebSocket sẵn trong lõi, nên chỉ cần vài chục dòng.
 *
 * DÙNG:
 *   node _tools/drive.js <url> <ảnh-ra.png> [số-giây] [--do="js"] [--size=WxH]
 *
 * In ra mọi lỗi và console.* của trang, rồi chụp màn hình. Trang có lỗi thì
 * thoát mã 1 — dùng được trong kiểm thử tự động.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

const url = process.argv[2];
const out = process.argv[3] || 'shot.png';
const wait = parseFloat(process.argv[4] || '4');
const doArg = (process.argv.find(a => a.startsWith('--do=')) || '').slice(5);
// --dofile=<path>: nạp nguyên một tệp JS làm biểu thức. Kịch bản đo tải (soak)
// dài vài trăm dòng, nhét vào một tham số dòng lệnh thì dấu nháy vỡ hết.
const doFile = (process.argv.find(a => a.startsWith('--dofile=')) || '').slice(9);
const sizeArg = (process.argv.find(a => a.startsWith('--size=')) || '--size=420x760').slice(7);
const [VW, VH] = sizeArg.split('x').map(Number);

function get(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, r => {
      let b = '';
      r.on('data', c => (b += c));
      r.on('end', () => res(b));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = require('os').tmpdir() + '/dc-chrome-' + process.pid;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--window-size=' + VW + ',' + VH,
    '--allow-file-access-from-files',
    'about:blank'
  ], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 60 && !list; i++) {
    await sleep(200);
    try { list = JSON.parse(await get('/json/list')); } catch (e) { /* chưa lên */ }
  }
  if (!list || !list.length) { console.error('không nối được Chrome'); process.exit(2); }
  const page = list.find(t => t.type === 'page') || list[0];

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const waiters = new Map();
  const send = (method, params) => new Promise(res => {
    const n = ++id;
    waiters.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params: params || {} }));
  });

  const errors = [];
  const logs = [];
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = m.params.args.map(a => a.value !== undefined ? a.value :
        (a.description || a.type)).join(' ');
      logs.push(m.params.type + ': ' + t);
      if (m.params.type === 'error') errors.push(t);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errors.push('[' + m.params.entry.source + '] ' + m.params.entry.text);
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  await sleep(wait * 1000);

  const expr = doFile ? fs.readFileSync(doFile, 'utf8') : doArg;
  if (expr) {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true });
    if (r && r.exceptionDetails) {
      errors.push('--do: ' + JSON.stringify(r.exceptionDetails.exception));
    } else if (r && r.result && r.result.value !== undefined) {
      console.log('do →', JSON.stringify(r.result.value));
    }
    await sleep(1400);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

  if (logs.length) console.log('--- console ---\n' + logs.slice(0, 40).join('\n'));
  if (errors.length) console.log('--- LỖI (' + errors.length + ') ---\n' +
    [...new Set(errors)].slice(0, 20).join('\n'));
  else console.log('không có lỗi');
  console.log('ảnh →', out);

  ws.close();
  chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  process.exit(errors.length ? 1 : 0);
})();
