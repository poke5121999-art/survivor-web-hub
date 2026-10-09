/*
 * Tốc Độ: mọi chế độ trong TD.MODES vào trận được và chạy không lỗi.
 * Mỗi chế độ: startRace({ mode }), tua timeScale, chờ qua đếm ngược rồi chạy vài giây; xe mình tự lái bằng bot.
 *   node test/toc-do-modes.js            (máy)       TD_URL=<gốc> node test/toc-do-modes.js   (Pages)
 *   TD_MODES=item,free  chỉ chạy vài chế độ.
 */
'use strict';
const { check, done, serve, browser, open, shot } = require('./toc-do-lib.js');

(async () => {
  const srv = await serve();
  const br = await browser();
  try {
    const { page, problems } = await open(br, srv.base, 'index.html');
    const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 250 }); return true; } catch (e) { return false; } };
    check('sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby', null, 90000));
    const ids = await page.evaluate(() => Object.keys(TD.MODES));
    const want = process.env.TD_MODES ? process.env.TD_MODES.split(',') : ids;
    for (const id of want) {
      await page.evaluate((m) => { TD.save.d.track = TD.save.d.track || Object.keys(TD.TRACKS)[0]; TD.main.startRace({ mode: m }); }, id);
      const ok = await until(() => TD.main.state === 'race' && TD.main.race, null, 120000);
      if (!check(id + ': vào trận', ok)) continue;
      const info = await page.evaluate((m) => {
        const R = TD.main.race, M = TD.MODES[m];
        TD.main.timeScale = 4;
        TD.main.me.ctrl = 'bot'; TD.Bot.init(TD.main.me, R, 0.9);
        return { mode: R.mode.id, n: R.karts.length, want: M.karts, teams: R.karts.map((k) => k.team), items: !!R.items, wantItems: !!M.items };
      }, id);
      check(id + ': đúng chế độ và số xe', info.mode === id && info.n === info.want, JSON.stringify({ mode: info.mode, n: info.n }));
      if (info.teams[0] != null) check(id + ': chia đủ hai đội', info.teams.filter((t) => t === 0).length === info.n / 2, info.teams.join(''));
      check(id + ': hộp đạo cụ theo chế độ', info.items === info.wantItems || !info.wantItems, 'items=' + info.items);
      // Ảo Ảnh chưa có bóng thì hỏi trước khi đua: chọn "Đua không có bóng".
      if (await until(() => document.querySelector('[data-practice="noghost"]'), null, 5000)) await page.click('[data-practice="noghost"] [data-p="go"]');
      const ran = await until(() => TD.main.race.phase !== 'countdown' && TD.main.race.t - TD.main.race.goT > 6, null, 180000);
      const st = await page.evaluate(() => ({ prog: Math.round(TD.main.me.progress), kmh: Math.round(TD.main.me.kmh) }));
      check(id + ': chạy được 6 s', ran && st.prog > 30, JSON.stringify(st));
      await shot(page, 'mode-' + id);
    }
    check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  } finally { await br.close(); srv.close(); }
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
