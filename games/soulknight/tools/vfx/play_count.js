/*
 * Đếm hiệu ứng SK.vfx sinh ra khi chơi thật: bọc SK.vfx.spawn, lái game bằng Playwright (giữ J bắn, K kỹ năng mỗi
 * 3,2 s, kéo người chơi lại gần quái) qua 12 nhân vật đầu + 3 phòng trùm + 2 phòng màn 2/3.
 *
 *   node games/soulknight/tools/vfx/play_count.js [giây mỗi lượt=15] [ra.json] [--give]
 *
 * --give: mỗi 4 s đổi sang một vũ khí khác trong SK.DS.weapons (giống nhặt đồ rơi) — không có thì chỉ thấy súng đầu.
 * Cần máy chủ ở gốc repo: python -m http.server 8811. Ra: {counts: {tên[@trạng thái]: lần}, from: {tên: {tệp:dòng}},
 * perRun, errs}; khoá '~follow' = số hiệu ứng bám theo vật (thân đạn, buff). Đưa vào gap_report.js --play.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const fs = require('fs');
const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const pos = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SECS = +(pos[0] || 15), OUT = pos[1] || 'vfx-playcount.json', GIVE = process.argv.includes('--give');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
  await p.evaluate(() => {
    window._vc = {}; window._vcFrom = {};
    const sp = SK.vfx.spawn;
    SK.vfx.spawn = function (G, name, x, y, o) {
      const h = sp.apply(this, arguments);
      const k = name + (o && o.state ? '@' + o.state : '');
      window._vc[k] = (window._vc[k] || 0) + 1;
      // ai gọi: dòng thứ 3 của stack (bỏ query ?v= trong URL tệp)
      const m = ((new Error().stack || '').split('\n')[2] || '').match(/js\/([\w/]+\.js)(?:\?[^:]*)?:(\d+)/);
      (window._vcFrom[k] || (window._vcFrom[k] = {}))[m ? m[1] + ':' + m[2] : '?'] = 1;
      if (h && o && o.follow) window._vc['~follow'] = (window._vc['~follow'] || 0) + 1;
      return h;
    };
  });
  const heroes = await p.evaluate(() => Object.keys(SK.DS.heroes));
  const plan = [];
  for (const h of heroes.slice(0, 12)) plan.push([h, '1-' + (1 + plan.length % 4)]);
  plan.push(['knight', '1-5'], ['ranger', '2-5'], ['knight', '3-5'], ['knight', '2-2'], ['ranger', '3-2']);
  const perRun = {};
  for (let pi = 0; pi < plan.length; pi++) {
    const [hero, stage] = plan[pi];
    const before = await p.evaluate(() => Object.assign({}, window._vc));
    await p.evaluate(h => { SK_GAME.debug.seed(20260930); SK.startRun(h); SK_GAME.debug.god(true); }, hero);
    await sleep(600);
    await p.evaluate(st => SK_GAME.debug.stage(st), stage);
    await sleep(800);
    const boss = /-5$/.test(stage);
    await p.evaluate(bs => SK_GAME.debug.teleportTo(bs ? 'boss' : 'battle'), boss);
    await p.keyboard.down('KeyJ');
    const t0 = Date.now(); let n = 0, room = 0;
    while (Date.now() - t0 < SECS * 1000) {
      await sleep(400); n++;
      if (GIVE && n % 10 === 5) await p.evaluate(k => { const ids = Object.keys(SK.DS.weapons); SK_GAME.debug.give(ids[(k * 7919) % ids.length]); }, n + pi * 131);
      if (n % 8 === 0) { await p.keyboard.down('KeyK'); await sleep(40); await p.keyboard.up('KeyK'); }
      const st = await p.evaluate(() => {
        const G = SK.G, pl = G.player; if (!pl) return 'none';
        pl.energy = 999;
        const es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
        if (!es.length) return G.room && G.room.state === 'locked' ? 'wait' : 'clear';
        es.sort((a, c) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(c.x - pl.x, c.y - pl.y));
        const e = es[0], W = SK.world;
        if (Math.hypot(e.x - pl.x, e.y - pl.y) > 110) {
          for (const [dx, dy] of [[-60, 0], [60, 0], [0, 60], [0, -60]]) {
            const x = e.x + dx, y = e.y + dy;
            if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x - 6, y) || W.solidAt(G.map, x + 6, y)) continue;
            pl.x = x; pl.y = y; break;
          }
        }
        return 'fight';
      });
      if (st === 'clear') { room++; if (!boss) await p.evaluate(r => SK_GAME.debug.teleportTo('battle', r % 3), room); }
    }
    await p.keyboard.up('KeyJ');
    const after = await p.evaluate(() => Object.assign({}, window._vc));
    const d = {};
    for (const k in after) { const v = after[k] - (before[k] || 0); if (v) d[k] = v; }
    perRun[hero + ' ' + stage] = d;
    console.log(hero, stage, Object.values(d).reduce((a, c) => a + c, 0), 'lần sinh');
  }
  const out = await p.evaluate(() => ({ counts: window._vc, from: window._vcFrom }));
  out.perRun = perRun; out.errs = errs;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out.counts).sort((a, c) => c[1] - a[1]).slice(0, 50)) console.log(String(v).padStart(6), k, Object.keys(out.from[k] || {}).join(' '));
  console.log('lỗi trang:', errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
})();
