/*
 * Kiểm thử đoạn kết của Chế độ Ải thường (games/soulknight/js/finale.js): 3-5 → 3-6 → Đá Phép → đèn → màn trắng → thẻ → VICTORY.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-finale.js
 * Biến môi trường: SK_URL, SK_SHOTS (thư mục ảnh).
 *
 * Bảng thời gian gốc [ĐO ObjectMagicStone.ItemTrigger]: đèn 1..4 ở 0,5 / 0,75 / 1,0 / 1,25 s, PlayFlash ở 5,0 s, StateMents ở 7,5 s.
 * Bộ kiểm lấy mẫu SK.finale.state() mỗi vài ms trong trang và đối chiếu với bảng SK.finale.state().timeline.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-finale');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const errs = [], results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(60); }
  return false;
}

async function main(b) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => SK_GAME.debug.seed(20261015));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 8000);

  // ---- ải cuối: dữ liệu
  const ss = await p.evaluate(() => SK.STAGES.map(s => s.label + (s.finale ? '*' : '')));
  check('Chế độ Ải thường có ải cuối 3-6 sau 3-5 (cờ finale)', ss.length === 16 && ss[14] === '3-5' && ss[15] === '3-6*', ss.slice(13).join(','));
  await p.evaluate(() => { SK_GAME.debug.god(true); SK_GAME.debug.stage('3-5'); });
  await sleep(300);
  await p.evaluate(() => { const G = SK.G; G.hold = false; G.phase = 'portal'; G.phaseT = 5; });
  const in36 = await until(p, () => SK_GAME.stage === '3-6' && SK_GAME.state === 'stage' && SK_GAME.phase !== 'portal', null, 4000);
  const room = await p.evaluate(() => ({ rooms: SK_GAME.rooms.map(r => r.type + ':' + r.w + 'x' + r.h), portal: !!SK.G.portal, theme: SK.G.map.theme,
    stone: SK.G.interactables.filter(o => o.label === 'Đá Phép').length, braz: SK.G.props.filter(o => o.t0 !== undefined).length, buff: !!SK.ROOMS.choice.open, enemies: SK_GAME.enemyCount }));
  check('3-5 → 3-6 (không chọn thiên phú): phòng khởi đầu 15×15 + phòng Đá Phép 19×19, không cổng, không quái, sàn riêng',
    in36 && room.rooms.join() === 'start:15x15,end:19x19' && !room.portal && room.theme === 'endhall' && room.stone === 1 && room.braz === 4 && !room.buff && room.enemies === 0, JSON.stringify(room));
  await sleep(2200);
  await p.evaluate(() => SK_GAME.debug.teleportTo('end', 0));
  await sleep(400);
  const idle = await p.evaluate(() => SK.finale.state());
  check('chưa chạm: finale ở trạng thái idle, đèn 0, không trắng', idle.phase === 'idle' && idle.lights === 0 && idle.flashAlpha === 0);

  // ---- chạm Đá Phép, lấy mẫu từng khung
  await p.evaluate(() => {
    window.__s = [];
    window.__iv = setInterval(() => {
      const s = SK.finale.state(), g = SK.gameover.state();
      window.__s.push({ t: s.t, ph: s.phase, l: s.lights, fa: s.flashAlpha, cert: s.cert, go: g.phase, modal: g.modal, st: SK_GAME.state, mv: SK_GAME.player.x + ',' + SK_GAME.player.y });
    }, 8);
  });
  await p.keyboard.press('KeyE');
  await until(p, () => SK.finale.state().cert, null, 14000);
  await p.evaluate(() => clearInterval(window.__iv));
  const S = await p.evaluate(() => window.__s), F = await p.evaluate(() => SK.finale.state());
  const TL = F.timeline, lightsAt = TL.filter(e => e.light);
  const expLights = t => lightsAt.filter(e => e.t <= t).length;
  const near = (t, ev) => ev.some(e => Math.abs(t - e.t) < 0.06);
  const badL = S.filter(s => s.ph === 'running' && !near(s.t, lightsAt) && s.l !== expLights(s.t));
  check('đèn 1..4 bật đúng 0,5 / 0,75 / 1,0 / 1,25 s (mọi mẫu khớp bảng)', lightsAt.map(e => e.t).join() === '0.5,0.75,1,1.25' && S.length > 100 && badL.length === 0,
    JSON.stringify({ mau: S.length, lech: badL.length, lightsAt: lightsAt.map(e => e.t) }));
  const lateOk = TL.every(e => { const l = F.log.find(x => x.at === e.t); return l && l.t >= e.t && l.t - e.t < 0.12; });
  check('mọi mục của bảng thời gian chạy đúng giờ (trễ dưới 1 khung ~0,1 s)', lateOk && F.log.length === TL.length, F.log.map(x => x.ev + '@' + x.t.toFixed(2)).join(' '));
  const fl = S.filter(s => s.ph === 'running');
  const before = fl.filter(s => s.t < 5.0), mid = fl.filter(s => s.t > 5.2 && s.t < 5.3), full = fl.filter(s => s.t > 5.6);
  check('màn trắng: 0 trước 5,0 s; mờ dần 0,5 s; trắng hẳn tới 7,5 s',
    before.every(s => s.fa === 0) && mid.length > 0 && mid.every(s => s.fa > 0.25 && s.fa < 0.7) && full.length > 0 && full.every(s => s.fa === 1),
    JSON.stringify({ truoc: before.length, giua: mid.map(s => s.fa.toFixed(2)).slice(0, 3), du: full.length }));
  const frozen = new Set(S.filter(s => s.ph === 'running').map(s => s.mv)).size === 1;
  check('nhân vật đứng yên suốt chuỗi (Pause)', frozen);
  const first = S.find(s => s.go === 'statement');
  check('7,5 s: vào bảng tổng kết VICTORY, thẻ hiện ngay, màn trắng tắt', first && first.t >= 7.5 && first.t < 7.65 && first.modal && first.cert && first.fa === 0 && first.st === 'victory', JSON.stringify(first));

  // ---- thẻ
  await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, 'certificate.png') });
  const c = await p.evaluate(() => SK.finale.state());
  const gt = await p.evaluate(() => SK.gameover.state());
  check('thẻ điền: tiêu đề GAME COMPLETE, ngày YY-MM-DD, thời gian hh:mm:ss, tên nhân vật; Total Damage là số đếm được',
    c.certText && c.certText[0] === 'GAME COMPLETE' && /^\d\d-\d\d-\d\d$/.test(c.certText[1]) && /^\d\d:\d\d:\d\d$/.test(c.certText[2]) && c.certText[3].length > 0 && Number.isInteger(c.dmg), JSON.stringify(c.certText) + ' dmg=' + c.dmg);
  await sleep(600);
  const still = await p.evaluate(() => ({ g: SK.gameover.state(), cert: SK.finale.state().cert }));
  check('trong lúc thẻ mở: bảng dưới thẻ đứng yên (page 0, t = 0, đếm ngược không chạy)', gt.t === 0 && still.g.page === 0 && still.g.t === 0 && still.g.modal === true && still.cert === true);
  const rc = await p.evaluate(() => SK.finale.rect('window_certificate/btn_close'));
  await p.mouse.click(rc.x + rc.w / 2, rc.y + rc.h / 2);
  const closed = await until(p, () => !SK.finale.state().cert && !SK.gameover.state().modal, null, 3000);
  await sleep(100);
  const after = await p.evaluate(() => ({ g: SK.gameover.state(), st: SK_GAME.state }));
  check('nút quay lại đóng thẻ → bảng VICTORY chạy tiếp từ t ≈ 0, nhãn 3-6', closed && after.st === 'victory' && after.g.phase === 'statement' && after.g.title === 'VICTORY' && after.g.label === '3-6' && after.g.page === 0 && after.g.t < 0.5,
    JSON.stringify({ t: after.g.t, label: after.g.label }));
  await until(p, () => SK.gameover.state().t > 1.4, null, 4000);
  await p.evaluate(() => { SK.gameover.hold = true; });
  await p.screenshot({ path: path.join(SHOTS, 'victory.png') });
  check('không lỗi trang / console / HTTP', errs.length === 0, errs.slice(0, 3).join(' | '));
}

(async () => {
  const guard = setTimeout(() => { console.log('quá giờ 150 s'); process.exit(2); }, 150000);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  try { await main(b); } catch (e) { check('chạy trọn', false, e.message.split('\n')[0] + (errs.length ? ' · ' + errs.slice(0, 3).join(' | ') : '')); }
  await b.close();
  clearTimeout(guard);
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
