/*
 * Hiệp Sĩ Linh Hồn: đường cong Transform của AnimationClip gốc (anims[key].tr) có trong dữ liệu và chạy khi chơi.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-anim-xform.js
 * Ảnh chụp quái chết: $SK_SHOTS hoặc <tmp>/soulknight-anim-xform/, tiền tố $SK_SHOT_TAG (mặc định "after").
 *
 * Số chuẩn [ĐO từ bundle 8.6, controller orc04 của e_orc08]: clip run đẩy nút "img" y 0.1 → 0 → 0.1 → 0 đơn vị
 * mỗi 0,125 s, tức 1,6 px (PPU 16). Clip malphite01_run đẩy "img" y 0 → 0 → 0.3 → 0 (4,8 px); trước đây
 * e_malphite01 chỉ là một khung tĩnh.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-anim-xform');
const TAG = process.env.SK_SHOT_TAG || 'after';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}
const near = (a, b) => Math.abs(a - b) < 1e-6;
const span = xs => xs.length ? Math.max(...xs) - Math.min(...xs) : 0;

async function main(b) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });

  // ---- dữ liệu
  const d = await p.evaluate(() => {
    const E = SK.D.enemies, A = SK.D.anims;
    const orc = E.e_orc08, run = orc && orc.anims.run, a = run && A[run];
    const mal = E.e_malphite01, mrun = mal && mal.anims.run, ma = mrun && A[mrun];
    const hk = SK.D.heroes.knight.s0, hr = A[hk.run];
    return {
      run, tr: a && a.tr || null, len: a && a.len, body: orc && orc.bodyPath,
      mrun, mtr: ma && ma.tr || null, mf: ma && ma.f.length, mbody: mal && mal.bodyPath,
      hrun: hk.run, htr: hr && hr.tr || null, hbody: hk.bodyPath,
      nTr: Object.values(A).filter(x => x.tr).length
    };
  });
  const orcP = d.tr && d.tr.img && d.tr.img.p;
  check('e_orc08 run = clip orc04/run, thân vẽ ở nút img/body', d.run === 'orc04/run' && d.body === 'img/body', d.run + ' · ' + d.body);
  check('orc04/run.tr.img.p = [[0,0,1.6],[0.125,0,0],[0.25,0,1.6],[0.375,0,0]]',
    JSON.stringify(orcP) === '[[0,0,1.6],[0.125,0,0],[0.25,0,1.6],[0.375,0,0]]' && near(d.len, 0.5), JSON.stringify(orcP) + ' len ' + d.len);
  check('biên độ nhún y của orc04/run = 1,6 px', !!orcP && near(span(orcP.map(k => k[2])), 1.6), orcP && span(orcP.map(k => k[2])).toFixed(3));
  const malP = d.mtr && d.mtr.img && d.mtr.img.p;
  check('e_malphite01 có state run chỉ gồm Transform (trước đây mất)', !!d.mrun && d.mf === 0 && !!malP && near(span(malP.map(k => k[2])), 4.8),
    d.mrun + ' f=' + d.mf + ' ' + JSON.stringify(malP));
  const heroP = d.htr && d.htr.img && d.htr.img.p;
  check('hero knight run có nhún img 1,6 px (clip skin_0_run)', !!heroP && near(span(heroP.map(k => k[2])), 1.6) && d.hbody === 'img/body',
    JSON.stringify(heroP) + ' · ' + d.hbody);
  check('có anim mang tr', d.nTr > 100, d.nTr + ' anim');

  // ---- khi chơi: giữ quái ở trạng thái chạy, móc SK.draw đọc y vẽ thân
  await p.evaluate(() => SK_GAME.debug.seed(20260930));
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'stage', null, 3000);
  await p.evaluate(() => SK_GAME.debug.god(true));
  await sleep(500);
  await p.evaluate(() => {
    const G = SK.G, pl = G.player;
    SK.AI.__TestRun = (G2, e) => { e.st = 'move'; };
    if (!SK.__xfWrapped) {
      const u = SK.updateEnemy;
      SK.updateEnemy = (G2, e, dt) => (e._freeze ? undefined : u(G2, e, dt));
      SK.__xfWrapped = true;
    }
    const mk = (id, dx) => {
      const e = SK.makeEnemy(G, id, pl.x + dx, pl.y + 2, G.room);
      e.st = 'move'; e.cls = '__TestRun'; e.face = 1; G.enemies.push(e); return e;
    };
    window.__orc = mk('e_orc08', 36); window.__mal = mk('e_malphite01', -36);
    window.__log = { orc: [], mal: [] };
    const d0 = SK.draw;
    SK.draw = function (c, name, x, y, o) {
      for (const tag of ['orc', 'mal']) {
        const e = tag === 'orc' ? window.__orc : window.__mal;
        if (e.st === 'move' && Math.abs(x - e.x) < 6 && Math.abs(y - e.y) < 12 && name === (SK.animFrame(e.anims.run, e.t) || e.d.body))
          window.__log[tag].push([+e.t.toFixed(3), +(y - e.y).toFixed(3)]);
      }
      return d0.apply(this, arguments);
    };
  });
  await sleep(1500);
  const log = await p.evaluate(() => window.__log);
  const oy = log.orc.map(r => r[1]), my = log.mal.map(r => r[1]);
  // Nội suy tuyến tính giữa khoá: mẫu theo khung hình rơi trong [-1,6; 0] px (y xuống), biên độ gần đủ 1,6.
  check('đang chơi: y vẽ thân orc chạy dao động trong 1,6 px', oy.length > 20 && Math.min(...oy) >= -1.6 - 1e-6 && Math.max(...oy) <= 1e-6 && span(oy) > 1.2,
    oy.length + ' lần vẽ, y lệch ∈ {' + [...new Set(oy)].sort((a, b) => a - b).join(', ') + '}');
  check('đang chơi: e_malphite01 (trước tĩnh) đổi tư thế theo thời gian', my.length > 20 && span(my) > 1,
    my.length + ' lần vẽ, biên độ ' + span(my).toFixed(2) + ' px');
  await p.screenshot({ path: path.join(SHOTS, TAG + '-run.png') });

  // ---- quái chết: chụp khung ở vài mốc của clip dead (dead của orc04: img y 0 → 0.6 → -0.2 trong 1 s)
  const shots = [];
  await p.evaluate(() => { const e = window.__mal; e._freeze = true; e.x += 1000; });
  await p.evaluate(() => { const e = window.__orc; SK.hurtEnemy(SK.G, e, 99999, false, 0, 0); e.kx = e.ky = 0; e.flash = 0; e._freeze = true; });
  const deadY = [];
  for (const T of [0, 0.25, 0.45, 1.0]) {
    await p.evaluate(T => { window.__orc.stT = T; window.__dy = null; }, T);
    await sleep(150);
    const r = await p.evaluate(() => {
      const e = window.__orc, v = SK.G.view, s = SK.view.scale, cv = document.getElementById('sk-view').getBoundingClientRect();
      const xf = SK.animPose ? SK.animPose(e.anims.dead, e.stT, e.d.bodyPath) : { dy: 0 };
      return { x: cv.left + (e.x - v.x - 28) * s, y: cv.top + (e.y - v.y - 44) * s, w: 56 * s, h: 56 * s, dy: xf.dy };
    });
    const file = path.join(SHOTS, TAG + '-dead-' + T.toFixed(2) + '.png');
    await p.screenshot({ path: file, clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h } });
    shots.push(file); deadY.push(r.dy);
  }
  check('clip dead nhảy lên rồi rơi thấp hơn (y lệch 0 → -9.6 → +3.2 px)', near(deadY[0], 0) && near(deadY[1], -9.6) && near(deadY[3], 3.2),
    deadY.map(v => v.toFixed(2)).join(' → '));
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  results.push('  ảnh: ' + shots.join(', '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  try { await main(b); } catch (e) { check('chạy trọn', false, e.message.split('\n')[0]); }
  await b.close();
  console.log(results.join('\n'));
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
