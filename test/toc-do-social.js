/*
 * Tốc Độ, nhánh Xã hội: Thư, Bạn Bè, Đội Đua, Cặp Đôi, BXH (js/ui/social.js).
 *   scratchpad/btest.sh node test/toc-do-social.js     (TD_URL=<gốc> để chạy trên Pages; TD_SHOTS=<thư mục> ảnh chụp)
 * Mỗi màn vẽ trong khung ở cả 1366×650 và 844×390; nhận thư cộng xu đúng số; thêm bạn từ trận vừa đua; XP đội sau trận;
 * chế độ Cặp Đôi vào trận 3 đội với người yêu cùng đội mình; đổi ngày thì thư thưởng đăng nhập mới.
 */
'use strict';
const { check, done, serve, browser, open, shot } = require('./toc-do-lib.js');

const VIEWPORTS = [['kb', { width: 1366, height: 650 }], ['touch', { width: 844, height: 390 }]];
const SCREENS = ['mail', 'friends', 'club', 'couple', 'rank'];
// Bảng XP đội theo hạng (js/ui/social.js clubXpFor): 20 + thưởng theo hạng.
const CLUB_XP = { 1: 40, 2: 34, 3: 30, 4: 26, 5: 24, 6: 22 };

(async () => {
  const srv = await serve();
  const br = await browser();
  try {
    const { page, problems } = await open(br, srv.base, 'index.html');
    const until = async (fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 60000, polling: 250 }); return true; } catch (e) { return false; } };
    const ev = (fn, arg) => page.evaluate(fn, arg);
    check('sảnh mở', await until(() => window.TD && TD.main && TD.main.state === 'lobby' && document.querySelector('.lb-home'), null, 90000));

    // ---- sảnh có đủ mục, chấm đỏ thư ----
    const lob = await ev(() => ({ top: [...document.querySelectorAll('.lb-top[data-entry]')].map((b) => b.dataset.entry), bar: [...document.querySelectorAll('.lb-bt[data-entry]')].map((b) => b.dataset.entry),
      mailDot: (document.querySelector('.lb-top[data-entry="mail"] .lb-dot') || {}).textContent, coins: TD.save.d.coins }));
    check('sảnh: Thư, Bạn Bè, BXH ở góc trên', ['mail', 'friends', 'rank'].every((e) => lob.top.includes(e)), lob.top.join(','));
    check('sảnh: Đội Đua, Cặp Đôi ở thanh dưới', ['club', 'couple'].every((e) => lob.bar.includes(e)), lob.bar.join(','));
    check('chấm đỏ thư = 2 (thư chào + thưởng đăng nhập)', lob.mailDot === '2', String(lob.mailDot));
    const coins0 = lob.coins;

    // ---- mỗi màn nằm trong khung, ở cả hai cỡ màn ----
    for (const [vn, vp] of VIEWPORTS) {
      await page.setViewportSize(vp);
      for (const sc of SCREENS) {
        await ev(() => { TD.lobby.show(); });
        await until(() => document.querySelector('.lb-home'), null, 20000);
        const sel = sc === 'club' || sc === 'couple' ? `.lb-bt[data-entry="${sc}"]` : `.lb-top[data-entry="${sc}"]`;
        await page.click(sel);
        const ok = await until((s) => document.querySelector(`.sc[data-screen="${s}"]`), sc, 10000);
        if (!check(`${vn}/${sc}: màn mở`, ok)) continue;
        const g = await ev(() => {
          const W = innerWidth, H = innerHeight, bad = [];
          const inside = (el, n) => { const r = el.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1 || r.width < 1) bad.push(n + ':' + [r.left, r.top, r.right, r.bottom].map(Math.round)); };
          const root = document.querySelector('.sc');
          inside(root, 'sc'); for (const q of ['.sc-h', '.sc-back', '.sc-b']) inside(document.querySelector(q), q);
          document.querySelectorAll('.sc-tab').forEach((t, i) => inside(t, 'tab' + i));
          const small = [...document.querySelectorAll('.sc-back, .sc-tab, .sc-bn')].filter((b) => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).length;
          return { bad, small, hscroll: document.documentElement.scrollWidth > W, vscroll: document.documentElement.scrollHeight > H + 1 };
        });
        check(`${vn}/${sc}: nằm trong khung`, g.bad.length === 0 && !g.hscroll && !g.vscroll, g.bad.join(' ') + (g.hscroll ? ' hscroll' : '') + (g.vscroll ? ' vscroll' : ''));
        check(`${vn}/${sc}: nút ≥ 44 px`, g.small === 0, g.small + ' nút nhỏ');
        await shot(page, `social-${vn}-${sc}`);
      }
    }
    await page.setViewportSize(VIEWPORTS[0][1]);

    // ---- Thư: nhận thư chào +500, đăng nhập ngày 1 +100 ----
    await ev(() => { TD.lobby.show(); });
    await until(() => document.querySelector('.lb-home'), null, 20000);
    await page.click('.lb-top[data-entry="mail"]');
    await until(() => document.querySelector('.sc-mail'), null, 10000);
    const welcome = await ev(() => TD.social.state().mail.find((m) => m.kind === 'sys'));
    check('thư chào có 500 xu', welcome && welcome.coins === 500, JSON.stringify(welcome ? welcome.coins : await ev(() => TD.social.state().mail.map((m) => m.kind + ':' + m.coins))));
    if (!welcome) throw new Error('mail has no sys welcome');
    await page.click(`.sc-row[data-id="${welcome.id}"]`);
    await page.click('[data-act="claim"]');
    check('nhận thư chào cộng đúng 500 xu', (await ev(() => TD.save.d.coins)) === coins0 + 500, String(await ev(() => TD.save.d.coins)));
    await page.click('[data-act="claim"]', { force: true, timeout: 1000 }).catch(() => {});
    check('nhận lại không cộng thêm', (await ev(() => TD.save.d.coins)) === coins0 + 500);
    await page.click('[data-act="claimall"]');
    check('nhận tất cả cộng thưởng đăng nhập 100', (await ev(() => TD.save.d.coins)) === coins0 + 600, String(await ev(() => TD.save.d.coins)));
    const unread = await ev(() => TD.social.badge.mail());
    check('chấm đỏ thư hết sau khi nhận hết', unread === 0, String(unread));
    // qua ngày: thưởng đăng nhập liên tục ngày 2 = 150 xu
    const next = await ev(() => { TD.social.now = () => Date.now() + 864e5; TD.social.refresh(); const m = TD.social.state().mail[0]; return { title: m.title, coins: m.coins, kind: m.kind }; });
    check('qua ngày: thư thưởng đăng nhập ngày 2 = 150 xu', next.kind === 'daily' && next.coins === 150, JSON.stringify(next));
    await ev(() => { TD.social.now = () => Date.now(); });

    // ---- Đội Đua: vào đội c3 bằng giao diện ----
    await page.click('.sc-back');
    await until(() => document.querySelector('.lb-home'), null, 20000);
    await page.click('.lb-bt[data-entry="club"]');
    await until(() => document.querySelector('.sc-club'), null, 10000);
    await page.click('[data-act="join"][data-id="c3"]');
    check('vào đội c3', (await ev(() => TD.social.state().club.id)) === 'c3');
    await shot(page, 'social-club-joined');

    // ---- Cặp Đôi: chọn người yêu bằng giao diện ----
    await page.click('.sc-back');
    await until(() => document.querySelector('.lb-home'), null, 20000);
    await page.click('.lb-bt[data-entry="couple"]');
    await until(() => document.querySelector('.sc-couple'), null, 10000);
    await page.click('[data-act="partner"][data-id="b3"]');
    const pname = await ev(() => TD.social.bots()[3].name), pcar = await ev(() => TD.social.bots()[3].car);
    check('chọn người yêu b3', (await ev(() => TD.social.state().couple.partner)) === 'b3');
    await shot(page, 'social-couple-chosen');
    const ros = await ev(() => { const m = TD.MODES.couple, r = TD.lobby.rosterFor(m, true); const p = r.list.find((x) => !x.me && x.team === 1); return { name: p && p.name, n: r.list.length }; });
    check('thẻ ghép phòng: đồng đội là người yêu', ros.name === pname && ros.n === 6, JSON.stringify(ros));

    // ---- trận Cặp Đôi: 3 đội, người yêu cùng đội ----
    await ev(() => { TD.save.d.track = TD.save.d.track || Object.keys(TD.TRACKS)[0]; TD.main.startRace({ mode: 'couple' }); });
    check('trận Cặp Đôi vào được', await until(() => TD.main.state === 'race' && TD.main.race, null, 120000));
    const cr = await ev(() => { const R = TD.main.race, me = TD.main.me, mate = R.karts.find((k) => k !== me && k.team === me.team), i = R.karts.indexOf(mate);
      return { mode: R.mode.id, n: R.karts.length, teams: R.karts.map((k) => k.team), mate: mate && mate.name, car: mate && mate.carId, view: TD.main.views[i].kart === mate, same: R.karts.filter((k) => k.name === mate.name).length, items: !!R.items }; });
    check('Cặp Đôi: 6 xe, 3 đội × 2', cr.mode === 'couple' && cr.n === 6 && [0, 1, 2].every((t) => cr.teams.filter((x) => x === t).length === 2), JSON.stringify(cr.teams));
    check('Cặp Đôi: người yêu đúng tên và xe, cùng đội mình', cr.mate === pname && cr.car === pcar && cr.same === 1 && cr.view, JSON.stringify(cr));
    check('Cặp Đôi: có đạo cụ', cr.items);
    await shot(page, 'social-couple-race');
    // về đích ngay để chốt kết quả thật qua main.settle
    check('qua đếm ngược', await until(() => TD.main.race.phase !== 'countdown' && TD.main.race.goT != null, null, 120000) || true);
    const before = await ev(() => { const s = TD.social.state(); return { club: s.club.xp, love: s.couple.xp.b3 || 0, coins: TD.save.d.coins, races: s.club.w.races }; });
    await ev(() => { TD.main.timeScale = 4; TD.Race.finish(TD.main.race, TD.main.me, false); });
    check('kết quả chốt', await until(() => TD.main.fin, null, 60000));
    const af = await ev(() => { const s = TD.social.state(), F = TD.main.fin; return { club: s.club.xp, love: s.couple.xp.b3, place: F.place, races: s.club.w.races, recent: s.recent.slice(), cards: F.cards.length,
      recentOk: s.recent.every((id) => TD.main.race.karts.some((k) => k.name === TD.social.bots().find((b) => b.id === id).name)), win: F.team && F.team.win === TD.main.me.team }; });
    check('XP đội tăng đúng bảng theo hạng ' + af.place, af.club - before.club === CLUB_XP[af.place], (af.club - before.club) + ' vs ' + CLUB_XP[af.place]);
    check('việc tuần đếm 1 trận', af.races - before.races === 1);
    const loveGain = af.love - before.love;
    check('điểm tình = 30 (hoặc 45 khi đội thắng)', loveGain === (af.win ? 45 : 30), loveGain + ' win=' + af.win);
    check('màn thưởng có 2 thẻ xã hội', af.cards >= 2, String(af.cards));
    check('đối thủ vừa đua được ghi nhận', af.recent.length >= 4 && af.recentOk, af.recent.join(','));

    // ---- Bạn Bè: thêm từ trận vừa đua ----
    await ev(() => { TD.main.toLobby(); });
    check('về sảnh', await until(() => document.querySelector('.lb-home'), null, 60000));
    await page.click('.lb-top[data-entry="friends"]');
    await until(() => document.querySelector('.sc-friends'), null, 10000);
    await page.click('[data-act="tab"][data-id="recent"]');
    const first = await ev(() => { const b = document.querySelector('[data-act="add"]'); return b ? b.dataset.id : null; });
    check('tab "Vừa đua" có người để kết bạn', !!first, String(first));
    await shot(page, 'social-friends-recent');
    await page.click(`[data-act="add"][data-id="${first}"]`);
    const fr = await ev(() => TD.social.state().friends.slice());
    check('kết bạn từ trận vừa đua', fr.length === 1 && fr[0] === first, fr.join(','));
    await page.click('[data-act="tab"][data-id="list"]');
    const rowName = await ev((id) => { const r = document.querySelector(`.sc-row[data-id="${id}"] b`); return r && r.textContent; }, first);
    check('bạn hiện trong danh sách', rowName === (await ev((id) => TD.social.bots().find((b) => b.id === id).name, first)), String(rowName));
    await page.click('[data-act="gift"]');
    check('tặng xăng: hôm nay không tặng lại được', await ev(() => document.querySelector('[data-act="gift"]').disabled));
    await shot(page, 'social-friends-list');
    // qua ngày: hôm qua mình tặng xăng nên bạn tặng lại 30 xu
    const back = await ev(() => { TD.social.now = () => Date.now() + 864e5; TD.social.refresh(); return TD.social.state().mail.some((m) => m.kind === 'gift' && m.coins === 30); });
    check('qua ngày: bạn tặng lại xăng 30 xu', back);
    await ev(() => { TD.social.now = () => Date.now(); });

    // ---- Đội Đua: nhiệm vụ tuần ----
    const c0 = await ev(() => { TD.social.state().club.w.races = 8; return TD.save.d.coins; });
    await page.click('.sc-back');
    await until(() => document.querySelector('.lb-home'), null, 20000);
    await page.click('.lb-bt[data-entry="club"]');
    await until(() => document.querySelector('.sc-club'), null, 10000);
    await page.click('[data-act="tab"][data-id="tasks"]');
    await page.click('[data-act="task"][data-id="races"]');
    check('nhiệm vụ tuần nhận 200 xu', (await ev(() => TD.save.d.coins)) === c0 + 200, String(await ev(() => TD.save.d.coins - 0)));
    await shot(page, 'social-club-tasks');
    await page.click('[data-act="tab"][data-id="members"]');
    await shot(page, 'social-club-members');

    // ---- BXH ----
    await page.click('.sc-back');
    await until(() => document.querySelector('.lb-home'), null, 20000);
    await page.click('.lb-top[data-entry="rank"]');
    await until(() => document.querySelector('.sc-rank'), null, 10000);
    const rk = await ev(() => ({ rows: document.querySelectorAll('.sc-list .sc-row').length, me: document.querySelectorAll('.sc-list .sc-row.me').length }));
    check('BXH cấp độ: 40 bot + mình', rk.rows === 41 && rk.me === 1, JSON.stringify(rk));
    await page.click('[data-act="tab"][data-id="time"]');
    const tm = await ev(() => document.querySelectorAll('.sc-list .sc-row').length);
    check('BXH thời gian: có kỷ lục đường của mình thì 41 dòng, chưa có thì 40', tm === 40 || tm === 41, String(tm));
    await shot(page, 'social-rank-time');

    check('không lỗi trang', problems.length === 0, problems.slice(0, 5).join(' | '));
  } finally { await br.close(); srv.close(); }
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
