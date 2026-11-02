#!/usr/bin/env node
/* Mèo & Súp "minigame" on the real page: the quick menu section lists the games, then each built game is played with real
 * clicks from the enter popup to the result card: butterfly catching, whack-a-mole (hard hat moles take two taps) and
 * Cooking Lab (guess three ingredients in order). Rewards, tries, totals and the save are checked; window.__failed() stays empty.
 *   node test/cats-soup-minigame-play.js
 *   CS_URL=https://.../games/cats-soup/index.html node test/cats-soup-minigame-play.js
 * Screenshots: shots/minigame-play/*.png */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots', 'minigame-play');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.css': 'text/css', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
let pass = 0, fail = 0;
const check = (name, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); ok ? pass++ : fail++; };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, s) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(f, (e, b) => {
        if (e) { s.writeHead(404); s.end(); return; }
        s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
        s.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = process.env.CS_URL ? null : await serve();
  const url = process.env.CS_URL || `http://localhost:${srv.address().port}/games/cats-soup/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = n => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const sub = k => page.evaluate(k => JSON.parse(JSON.stringify(window.__game.state.minigame.sub[k])), k);
  const click = (sel, o = {}) => page.locator(sel).first().click({ force: true, ...o });
  const failed = () => page.evaluate(() => (window.__failed ? window.__failed().length : -1));
  const coins = () => page.evaluate(() => window.__game.state.coin);
  const centre = async sel => page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, sel);

  await page.goto(`${url}?fresh`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  check('feature loads without a failed hook', await failed() === 0);
  check('fresh state: 1 free + 2 ad tries a day for both sub games, 2 for Cooking Lab', await page.evaluate(() => {
    const m = window.__game.state.minigame;
    return m.sub[1].free === 1 && m.sub[1].ads === 2 && m.sub[2].free === 1 && m.mini[5].tries === 2;
  }));

  // ---- quick menu: section "Trò Chơi Nhỏ" ----
  await click('[data-n="bt_more"] .w');
  await page.waitForSelector('.sh-more');
  const names = await page.locator('.sh-more').allInnerTexts();
  check('quick menu lists the three games', ['Bắt bướm', 'Trò chơi Đập Chuột', 'Phiêu Lưu'].every(n => names.some(x => x.trim() === n)), names.join(' | '));
  const titles = await page.locator('.sh-more-title').allInnerTexts();
  check('under the section "Trò Chơi Nhỏ"', titles.includes('Trò Chơi Nhỏ'), titles.join(' | '));
  await shot('01-menu');

  // ---- butterfly: a real 20 s play ----
  await page.locator('.sh-more', { hasText: /^\s*Bắt bướm\s*$/ }).click({ force: true });
  await page.waitForSelector('.mg-layer [data-n="btn_start"]', { state: 'attached' });
  await page.waitForTimeout(500);
  await shot('02-enter-butterfly');
  const coin0 = await coins();
  await click('.mg-layer [data-n="btn_start"] [data-n="bg"] > .w');
  await page.waitForSelector('.mg-layer [data-n="guide_info_ui"] [data-n="Background"] > .w', { state: 'visible' });
  await shot('03-guide-butterfly');
  check('start spends the free try', (await sub(1)).free === 0);
  await click('.mg-layer [data-n="guide_info_ui"] [data-n="Background"] > .w');
  let caught = 0, rare = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const done = await page.evaluate(() => !!window.__mgSes && window.__mgSes.done);
    if (done) break;
    const p = await centre('.mg-fly:not(.caught)');
    if (p) {
      const type = await page.evaluate(() => { const e = document.querySelector('.mg-fly:not(.caught)'); return e ? e.dataset.type : '0'; });
      await page.mouse.click(p.x, p.y);
      caught += 1;
      if (type !== '0') rare += 1;
    }
    if (caught === 6 && !fs.existsSync(path.join(SHOTS, '04-butterfly-play.png'))) await shot('04-butterfly-play');
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => { const e = document.querySelector('.mg-layer [data-n="result_info_ui"]'); return e && e.style.display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot('05-butterfly-result');
  const bf = await page.evaluate(() => ({ score: window.__mgSes.score, res: window.__mgResult }));
  const s1 = await sub(1);
  check('butterfly play ended with a score from real taps', bf.score > 0 && bf.score <= caught, `score ${bf.score}, clicks ${caught}`);
  check('score is the season total', s1.total === bf.score && s1.top === bf.score, JSON.stringify([s1.total, s1.top]));
  check('single rewards of the group were paid (score >= 10: 5 coins)', bf.score < 10 || (await coins()) - coin0 === 5, `coins ${coin0} -> ${await coins()}`);
  check('result lists the three rewards of 10/20/25 points', (await page.locator('.mg-layer [data-n="lb_need_score"]').allInnerTexts()).join(',') === '10p,20p,25p');
  await click('.mg-layer [data-n="btn_exit"] [data-n="Background"] > .w');
  await page.waitForSelector('.mg-layer [data-n="btn_practice"]', { state: 'attached' });
  check('exit returns to the enter popup with the total', (await page.locator('.mg-layer [data-n="total_point"]').first().innerText()) === String(s1.total));
  // season reward: lift the total to the first row and claim it from the list
  await page.evaluate(() => { window.__game.state.minigame.sub[1].total = 60; window.__minigame.cur().refresh(); });
  const t1201 = await page.evaluate(() => window.__game.state.specials.tickets[1202] || 0);
  await page.locator('.mg-layer .mg-row .go:not(.off)').first().click();
  check('season reward row pays once ticket 1202 x5', await page.evaluate(t => (window.__game.state.specials.tickets[1202] || 0) - t, t1201) === 5);
  await shot('06-enter-claimed');
  // practice: no try, no score
  const before = await sub(1);
  await click('.mg-layer [data-n="btn_practice"] .w');
  await click('.mg-layer [data-n="guide_info_ui"] [data-n="Background"] > .w');
  await page.waitForTimeout(4500);
  for (let i = 0; i < 6; i++) { const p = await centre('.mg-fly:not(.caught)'); if (p) await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); }
  const pr = await page.evaluate(() => window.__mgSes.score);
  const after = await sub(1);
  check('practice butterfly: caught but no try spent and no total', pr > 0 && after.free === before.free && after.ads === before.ads && after.total === before.total, `score ${pr}`);
  await page.evaluate(() => window.__minigame.close());

  // ---- mole: hard hat moles need two taps ----
  await page.evaluate(() => window.__minigame.openEnter(2));
  await page.waitForSelector('.mg-layer [data-n="btn_start"]', { state: 'attached' });
  await page.waitForTimeout(400);
  await click('.mg-layer [data-n="btn_start"] [data-n="bg"] > .w');
  await page.waitForSelector('.mg-layer [data-n="guide_info_ui"] [data-n="Background"] > .w', { state: 'visible' });
  await shot('07-guide-mole');
  await click('.mg-layer [data-n="guide_info_ui"] [data-n="Background"] > .w');
  let taps = 0, hats = 0;
  const t2 = Date.now();
  let shotPlay = false;
  while (Date.now() - t2 < 45000) {
    const st = await page.evaluate(() => {
      const s = window.__mgSes;
      if (s.done) return { done: true };
      const i = s.holes.findIndex(h => h.state === 'up');
      return { done: false, i, hat: i >= 0 && s.holes[i].grade === 1 };
    });
    if (st.done) break;
    if (st.i >= 0) {
      const p = await page.evaluate(i => {
        const holes = [...document.querySelectorAll('.mg-layer [data-n="moleArea"] > [data-n^="hole"]')];
        const e = holes[i] && holes[i].querySelector('[data-n="spr_body"]');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, st.i);
      if (p) {
        await page.mouse.click(p.x, p.y);
        taps += 1;
        if (st.hat) { hats += 1; await page.mouse.click(p.x, p.y); taps += 1; }
        if (taps >= 4 && !shotPlay) { shotPlay = true; await shot('08-mole-play'); }
      }
    }
    await page.waitForTimeout(40);
  }
  await page.waitForFunction(() => { const e = document.querySelector('.mg-layer [data-n="result_info_ui"]'); return e && e.style.display !== 'none'; }, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot('09-mole-result');
  const ml = await page.evaluate(() => ({ score: window.__mgSes.score, caught: window.__mgSes.caught, total: window.__game.state.minigame.sub[2].total, res: window.__mgResult }));
  check('mole play ended with points from real taps', ml.score > 0 && ml.caught > 0, JSON.stringify([ml.score, ml.caught, taps, hats]));
  check('mole score is the season total', ml.total === ml.score, `${ml.total} vs ${ml.score}`);
  await click('.mg-layer [data-n="btn_exit"] [data-n="Background"] > .w');
  await page.waitForSelector('.mg-layer [data-n="btn_practice"]', { state: 'attached' });
  await page.evaluate(() => window.__minigame.close());

  // ---- Cooking Lab: wrong guess first (hint text and the history row), then the exact answer ----
  await click('[data-n="bt_more"] .w');
  await page.waitForSelector('.sh-more');
  await page.locator('.sh-more', { hasText: /^\s*Phiêu Lưu\s*$/ }).click({ force: true });
  await page.waitForSelector('.mg-layer [data-n="btn_start"]', { state: 'attached' });
  await page.waitForTimeout(500);
  await click('.mg-layer [data-n="btn_start"] [data-n="bg"] > .w');
  await page.waitForSelector('[data-n="cook-start"]', { state: 'attached' });
  await shot('10-cook-guide');
  check('Cooking Lab start spent one of two tries', await page.evaluate(() => window.__game.state.minigame.mini[5].tries) === 1);
  await click('[data-n="cook-start"]');
  const ans = await page.evaluate(() => window.__cook.answer.slice());
  const wrong = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => !ans.includes(i)).slice(0, 3);
  for (const i of wrong) await click(`.mg-item[data-i="${i}"]`);
  await page.waitForTimeout(300);
  check('a wrong guess shows the hint and a history row', (await page.locator('.mg-hist .mg-hrow').count()) === 1 && (await page.locator('.mg-hint').innerText()).length > 3, await page.locator('.mg-hint').innerText());
  check('and uses one of 15 tries', (await page.locator('.mg-tries').innerText()) === 'x14');
  await shot('11-cook-wrong');
  const coin1 = await coins();
  for (const i of ans) await click(`.mg-item[data-i="${i}"]`);
  await page.waitForSelector('[data-n="cook-exit"]', { timeout: 5000 });
  await page.waitForTimeout(300);
  await shot('12-cook-result');
  const ck = await page.evaluate(() => ({ won: window.__cook.won, score: window.__cook.score, m: window.__game.state.minigame.mini[5] }));
  check('exact answer wins 200 points', ck.won && ck.score === 200 && ck.m.total === 200 && ck.m.top === 200, JSON.stringify(ck));
  check('rewards paid: 5 coins', (await coins()) - coin1 === 5, `${coin1} -> ${await coins()}`);
  await click('[data-n="cook-exit"]');
  await page.waitForSelector('.mg-layer [data-n="btn_practice"]', { state: 'attached' });
  check('Cooking Lab season rows ready at 50, 100 and 160 points (total 200)', await page.evaluate(() => window.__game.state.minigame.mini[5].total) === 200 && (await page.locator('.mg-layer .mg-row .go:not(.off)').count()) === 3);
  await page.locator('.mg-layer .mg-row .go:not(.off)').first().click();
  check('claiming a Cooking Lab row marks it done', (await page.locator('.mg-layer .mg-row.done').count()) === 1);
  await shot('13-cook-enter');
  await page.evaluate(() => window.__minigame.close());

  // ---- save survives a reload ----
  const saved = await page.evaluate(() => { const m = window.__game.state.minigame; return [m.sub[1].total, m.sub[2].total, m.mini[5].total, m.sub[1].claimed.length, m.mini[5].claimed.length]; });
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  const loaded = await page.evaluate(() => { const m = window.__game.state.minigame; return [m.sub[1].total, m.sub[2].total, m.mini[5].total, m.sub[1].claimed.length, m.mini[5].claimed.length]; });
  check('totals and claimed rows survive a reload', JSON.stringify(saved) === JSON.stringify(loaded), `${saved} vs ${loaded}`);
  check('no failed hook after the whole run', await failed() === 0);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  if (srv) srv.close();
  process.exit(fail ? 1 : 0);
})();
