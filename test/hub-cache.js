/*
 * Bộ kiểm cho nút "Tải lại bản mới" trên hub.
 * Phải chạy qua HTTP thật (không phải file://) vì đúng thứ đang đo là cache HTTP.
 */
const PW = 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/survivor-web-hub';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else    { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}

// Máy chủ giả lập GitHub Pages: cùng một header Cache-Control: max-age=600.
const daPhucVu = [];        // mọi request tới, kèm có phải là bản "nạp lại" không
function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((req, rq) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(ROOT, u === '/' ? '/index.html' : u);
      daPhucVu.push({ url: u, noStore: (req.headers['cache-control'] || '') });
      fs.readFile(f, (e, b) => {
        if (e) { rq.writeHead(404); rq.end('no'); return; }
        rq.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                            'Cache-Control': 'max-age=600' });
        rq.end(b);
      });
    });
    srv.listen(port, () => res(srv));
  });
}

(async () => {
  const srv = await serve(8791);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  // Vào bằng khách để qua cổng đăng nhập.
  await p.goto('http://127.0.0.1:8791/index.html');
  await p.waitForTimeout(400);
  if (p.url().indexOf('login') >= 0) {
    await p.evaluate(() => HubSession.set({ kind: 'guest', name: 'Khách' }));
    await p.goto('http://127.0.0.1:8791/index.html');
    await p.waitForTimeout(500);
  }
  check('vào được hub', p.url().indexOf('login') < 0, p.url());

  // Nút nằm ở chân trang, mà lưới game dài hơn một màn hình - phải cuộn tới nó rồi
  // mới hỏi "có bị che không", nếu không thì elementFromPoint trả về thứ đang nằm ở
  // toạ độ đó TRONG KHUNG NHÌN chứ không phải thứ nằm trên cái nút.
  await p.evaluate(() => document.getElementById('hub-refresh').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(200);
  const co = await p.evaluate(() => {
    const b = document.getElementById('hub-refresh');
    if (!b) return { co: false };
    const r = b.getBoundingClientRect();
    const tren = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { co: true, chu: b.textContent.trim(), hien: getComputedStyle(b).display !== 'none',
             bamDuoc: !!(tren && b.contains(tren)),
             ghiChu: (document.getElementById('hub-refresh-note') || {}).textContent || '' };
  });
  check('có nút trên trang', co.co && co.hien, co.chu || '');
  check('nút không bị gì che', co.bamDuoc);
  check('có ghi chú nói rõ không mất tiến độ',
    /không đụng vào tiến độ/.test(co.ghiChu), co.ghiChu.slice(0, 60));

  // Gieo dữ liệu chơi vào localStorage: bấm nút xong nó phải CÒN NGUYÊN.
  await p.evaluate(() => {
    localStorage.setItem('repoSquad.save', JSON.stringify({ gold: 12345, chars: ['bao'] }));
    localStorage.setItem('repo2d.best', '99');
  });

  // Ghi lại mọi câu báo tiến trình NGAY TRONG TRANG: trên máy nhanh, cả vòng nạp lại
  // xong trước khi phép đo kịp hỏi, và hỏi sau khi trang đã điều hướng thì chỉ nhận
  // được "context destroyed" chứ không phải một kết luận về cái nút.
  await p.evaluate(() => {
    window.__nhat = [];
    const n = document.getElementById('hub-refresh-note');
    new MutationObserver(() => window.__nhat.push(n.textContent)).observe(n, {
      childList: true, characterData: true, subtree: true });
    const b = document.getElementById('hub-refresh');
    const cu = Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
    Object.defineProperty(b, 'disabled', {
      get(){ return cu.get.call(this); },
      set(v){ if (v) window.__khoa = true; cu.set.call(this, v); }
    });
    sessionStorage.setItem('__dangDo', '1');
  });

  daPhucVu.length = 0;
  const nhatKy = [];
  p.on('framenavigated', () => {});
  await p.click('#hub-refresh');
  // Vét câu báo trước khi trang kịp điều hướng.
  for (let i = 0; i < 30; i++) {
    const r = await p.evaluate(() => ({ n: window.__nhat || [], k: !!window.__khoa }))
      .catch(() => null);
    if (!r) break;                                  // đã điều hướng: đo xong phần này
    if (r.n.length) nhatKy.push.apply(nhatKy, r.n);
    if (r.k) nhatKy.push('__KHOA__');
    await p.waitForTimeout(40);
  }
  check('bấm rồi thì khoá nút lại, không bấm chồng được', nhatKy.indexOf('__KHOA__') >= 0);
  check('có báo tiến trình', nhatKy.some(x => /Đang nạp lại|Xong/.test(x)),
    (nhatKy.filter(x => x !== '__KHOA__')[0] || '').slice(0, 50));

  // Chờ nó nạp lại xong và tự khởi động lại.
  await p.waitForFunction(() => location.search.indexOf('fresh=') >= 0, null, { timeout: 15000 })
    .catch(() => {});
  await p.waitForTimeout(800);

  check('nạp lại xong thì tự mở lại trang', p.url().indexOf('fresh=') >= 0, p.url());

  const con = await p.evaluate(() => ({
    save: localStorage.getItem('repoSquad.save'),
    best: localStorage.getItem('repo2d.best'),
    dangNhap: !!(window.HubSession && HubSession.isSignedIn && HubSession.isSignedIn())
  }));
  check('TIẾN ĐỘ CHƠI còn nguyên sau khi bấm',
    con.save && JSON.parse(con.save).gold === 12345 && con.best === '99',
    con.save ? 'gold ' + JSON.parse(con.save).gold : 'MẤT');
  check('phiên đăng nhập còn nguyên', con.dangNhap);

  // Nó có thật sự đi hỏi lại máy chủ những file cần không?
  const daHoi = daPhucVu.map(x => x.url);
  const ép = daPhucVu.filter(x => /no-cache|no-store/.test(x.noStore)).length;
  const coGame = daHoi.filter(u => /^\/games\/.+index\.html$/.test(u)).length;
  const coJsGame = daHoi.some(u => /^\/games\/repo2d\/game\.js$/.test(u));
  const coHubJs = daHoi.some(u => /^\/js\/hub\.js$/.test(u));
  check('có ép máy chủ trả bản mới (bỏ qua cache)', ép > 5, ép + ' request mang no-cache');
  check('nạp lại HTML của các game', coGame >= 5, coGame + ' trang game');
  check('nạp lại cả file js BÊN TRONG game', coJsGame,
    coJsGame ? '' : 'chỉ nạp HTML, js của game vẫn là bản cũ');
  check('nạp lại file js của hub', coHubJs);

  const e = errs.filter(x => !/favicon|404/.test(x));
  check('không lỗi console', e.length === 0, e.slice(0, 2).join(' | '));

  await b.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + '═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
