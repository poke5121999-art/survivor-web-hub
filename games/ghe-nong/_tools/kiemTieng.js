/* kiemTieng.js — kiểm tiếng và nhạc nền chạy thật trong trình duyệt.

   Máy kiểm không có tai, nên đếm thứ đi ra loa: móc AudioBufferSourceNode.start (tiếng) và
   HTMLMediaElement.play (nhạc nền), rồi đi qua từng màn và đòi đúng thứ phải kêu.

   Chạy: node _tools/kiemTieng.js [URL tới index.html]
   Mặc định: http://localhost:8765/games/ghe-nong/index.html (python -m http.server 8765 ở gốc repo)
*/
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const DICH = process.argv[2] || 'http://localhost:8765/games/ghe-nong/index.html';

let hong = 0;
function ok(dk, chu) { console.log((dk ? 'ĐẠT  ' : 'HỎNG ') + chu); if (!dk) hong++; }

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const loi = [];
  p.on('pageerror', e => loi.push('pageerror ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/vibrate/.test(m.text())) loi.push('console ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400) loi.push('http ' + r.status() + ' ' + r.url()); });
  await p.addInitScript(() => {
    window.__keu = [];
    window.__nhac = [];
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () {
      window.__keu.push(this.buffer ? +this.buffer.duration.toFixed(2) : 0);
      return st.apply(this, arguments);
    };
    const pl = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__nhac.push(this.src.split('/').pop().split('?')[0]);
      return pl.apply(this, arguments);
    };
  });

  async function vao(hash) {
    await p.goto('about:blank');
    await p.goto(DICH + (hash ? '#' + hash : ''));
    await p.waitForTimeout(1200);
    await p.mouse.click(5, 5);
    await p.evaluate(() => { [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Hiểu rồi' && b.offsetParent).forEach(b => b.click()); });
    await p.waitForTimeout(1500);
  }
  const dem = () => p.evaluate(() => ({ keu: window.__keu.slice(), nhac: window.__nhac.slice() }));

  /* 1. mọi tệp trong bảng tải được */
  await vao('');
  const tep = await p.evaluate(() => {
    const a = window.AM_BANG, ds = new Set();
    Object.values(a.tieng).forEach(x => x.forEach(y => ds.add(y[0])));
    Object.values(a.nhac).forEach(x => ds.add(x));
    return [...ds];
  });
  const hongTep = [];
  for (const t of tep) {
    const r = await p.request.get(new URL(t, DICH).href).catch(() => null);
    if (!r || r.status() !== 200) hongTep.push(t);
  }
  ok(tep.length > 100 && hongTep.length === 0, `tải được ${tep.length - hongTep.length}/${tep.length} tệp tiếng ${hongTep.slice(0, 3).join(' ')}`);

  /* 2. màn CLB: nhạc nhà; chạm một nút có tiếng */
  let d = await dem();
  ok(d.nhac.includes('n_clb.mp3'), 'màn CLB phát nhạc n_clb (' + d.nhac.join(',') + ')');
  const truoc = d.keu.length;
  await p.evaluate(() => { const b = [...document.querySelectorAll('#clb-menu button, #clb-menu div')].find(x => /Tuyển mộ/.test(x.textContent)); if (b) b.click(); });
  await p.waitForTimeout(800);
  d = await dem();
  ok(d.keu.length > truoc, 'chạm tab Tuyển mộ có tiếng (' + (d.keu.length - truoc) + ')');
  ok(d.nhac.includes('n_gacha.mp3'), 'tab Tuyển mộ đổi sang nhạc n_gacha');

  /* 3. màn ca: nhạc ca */
  await vao('ca');
  d = await dem();
  ok(d.nhac.includes('n_ca.mp3'), 'màn ca phát nhạc n_ca (' + d.nhac.join(',') + ')');

  /* 4. cấm chọn: nhạc banpick, chạm hai lần một tướng thì có tiếng cấm */
  await vao('draft');
  d = await dem();
  ok(d.nhac.includes('n_draft.mp3'), 'màn cấm chọn phát nhạc n_draft');
  const t0 = d.keu.length;
  const the = p.locator('.dr-t:not(.cam):not(.lay)').first();
  if (await the.count()) { await the.click(); await p.waitForTimeout(200); await the.click(); await p.waitForTimeout(900); }
  d = await dem();
  ok(d.keu.length - t0 >= 2, 'chốt một lượt cấm có tiếng (' + (d.keu.length - t0) + ' tiếng)');

  /* 5. trận: nhạc trận, tiếng đánh của tướng trong khung */
  await vao('tran:900');
  const k0 = (await dem()).keu.length;
  await p.waitForTimeout(4000);
  d = await dem();
  ok(d.nhac.some(x => /n_tran2?\.mp3/.test(x)), 'màn trận phát nhạc trận (' + d.nhac.slice(-1) + ')');
  ok(d.keu.length - k0 >= 5, 'trận có tiếng đánh/chiêu trong 4 giây (' + (d.keu.length - k0) + ')');
  const dangKeu = await p.evaluate(() => window.__keu.length);
  ok(dangKeu < 2000, 'không phát dồn hàng nghìn tiếng (' + dangKeu + ')');

  /* 6. tắt tiếng thì im */
  await p.evaluate(() => window.tatTieng(true));
  const k1 = (await dem()).keu.length;
  await p.waitForTimeout(2500);
  d = await dem();
  ok(d.keu.length === k1, 'tắt tiếng thì không phát thêm tiếng nào (' + (d.keu.length - k1) + ')');

  ok(loi.length === 0, 'không lỗi trang / 404 ' + loi.slice(0, 4).join(' | '));
  await b.close();
  console.log(hong ? `${hong} mục HỎNG` : 'tất cả ĐẠT');
  process.exit(hong ? 1 : 0);
})();

