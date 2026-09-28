/*
 * PokéOne — cảnh trận 2D kiểu PRO (games/pokeone/js/battle.js), bấm chuột thật lên nút DOM.
 *
 * Chạy:  node test/pokeone-battle.js
 *        ONLY=wild,boss SIZES=1366x768 node test/pokeone-battle.js     chạy một phần
 * Ảnh ra SHOTS (mặc định %TEMP%/pokeone-battle-shots): mở màn, bảng chiêu, hoạt ảnh chiêu, lên cấp, bóng lắc,
 * đổi con, huấn luyện viên, boss — ở 1366x768 và 844x390. Mở ra xem.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-battle-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf', '.css': 'text/css', '.json': 'application/json' };
const SPEED = process.env.BSPEED || '3';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const SIZES = (process.env.SIZES || '1366x768,844x390').split(',').map((s) => s.split('x').map(Number));
const want = (name) => !ONLY.length || ONLY.includes(name);

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  const line = (ok ? '  ✔ ' : '  ✘ ') + name + (detail != null ? '  — ' + detail : '');
  out.push(line);
  console.log(line);
}
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

async function open(browser, base, W, H, query, errors) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/games/pokeone/index.html?fresh=1&bspeed=' + SPEED + '&' + query);
  const t = {
    page,
    shot: (name) => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + name + '.png') }),
    mode: (m, ms) => page.waitForFunction((m) => P1.battleScene && P1.battleScene.mode === m && !!P1.battleScene.pick === (m !== 'busy'), m, { timeout: ms || 90000 }),
    modeIn: (ms, tmo) => page.waitForFunction((ms) => {
      const s = P1.battleScene;
      return s && (s.result || (ms.includes(s.mode) && (s.pick || s.mode === 'learn' || s.mode === 'end')));
    }, ms, { timeout: tmo || 90000 }),
    info: () => page.evaluate(() => {
      const s = P1.battleScene;
      return { mode: s.mode, result: s.result || null, log: s.logLines.slice(), party: P1.state.party.length,
        exp: P1.state.party[0].exp, level: P1.state.party[0].level, money: P1.state.money };
    }),
  };
  // Kiểm điểm giữa nút đúng là nút đó (không bị lớp khác đè) rồi mới bấm chuột thật.
  t.click = async (sel) => {
    const b = page.locator(sel).first();
    await b.waitFor({ state: 'visible', timeout: 20000 });
    const box = await b.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const ok = await page.evaluate(([x, y, sel]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest(sel)); }, [x, y, sel]);
    if (!ok) throw new Error('click on ' + sel + ' lands on another element');
    await page.mouse.click(x, y);
  };
  return t;
}

/* Chiêu gây sát thương mạnh nhất còn PP. */
async function attack(t) {
  const slot = await t.page.evaluate(() => {
    const s = P1.battleScene, act = s.battle.active('p1'), sim = s.battle.simMon('p1', act.index);
    let best = 1, bp = -1;
    act.mon.moves.forEach((m, k) => { const mv = P1.Dex.moves.get(m.id); if (sim.moveSlots[k].pp > 0 && mv.basePower > bp) { bp = mv.basePower; best = k + 1; } });
    return best;
  });
  await t.click('[data-b="move-' + slot + '"]');
}

async function fightToEnd(t, onTurn) {
  for (let turn = 0; turn < 60; turn++) {
    await t.modeIn(['menu', 'forced', 'learn', 'end']);
    const m = (await t.info()).mode;
    if (m === 'end') return;
    if (m === 'learn') { await onTurn('learn'); await t.page.waitForFunction(() => P1.battleScene.mode !== 'learn', null, { timeout: 30000 }); continue; }
    if (m === 'forced') {
      const n = await t.page.evaluate(() => P1.battleScene.battle.switchable()[0].index);
      await t.click('[data-b="party-' + n + '"]');
      continue;
    }
    if (onTurn) await onTurn('menu', turn);
    await attack(t);
    await t.page.waitForFunction(() => !P1.battleScene.pick, null, { timeout: 10000 });
  }
}

const waitEnd = (t) => t.page.waitForFunction(() => P1.battleScene && P1.battleScene.result, null, { timeout: 120000 });
const introDone = (t) => t.page.waitForFunction(() => {
  const s = P1.battleScene;
  return s && s.fade === 0 && !s.actors.p1.hidden && !s.actors.p2.hidden && s.actors.p1.scale === 1 && s.box.p1 && s.box.p1.slide === 0;
}, null, { timeout: 60000 });

async function scenarios(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  console.log('\n[' + tag + ']');
  const errors = [];

  if (want('wild')) {
    // Charmander Lv7 đánh Pidgey Lv3: thắng, thanh EXP chạy, lên cấp 8.
    const t = await open(browser, base, W, H, 'battle=16:3&party=4:7', errors);
    await t.page.waitForFunction(() => P1.battleScene && P1.battleScene.actors && !P1.battleScene.actors.p2.hidden && P1.battleScene.actors.p2.tintA === 0, null, { timeout: 60000 });
    await t.shot('01-intro');
    await introDone(t);
    await t.mode('menu');
    const art = await t.page.evaluate(() => {
      const s = P1.battleScene;
      return { bg: !!P1.imgNow(s.bgUrl), foe: !!s.actors.p2.img, me: !!s.actors.p1.img, bgUrl: s.bgUrl };
    });
    check(tag + ' background and both sprites loaded', art.bg && art.foe && art.me, JSON.stringify(art));
    const moves = await t.page.locator('[data-b^="move-"]').count();
    check(tag + ' move panel lists Charmander\'s 3 moves', moves === 3, moves);
    const before = await t.page.evaluate(() => { const m = P1.state.party[0]; m.exp = P1.mon.expAt(4, 8) - 1; return { exp: m.exp }; });
    if (W >= 1000) await t.page.locator('[data-b="move-3"]').hover();
    await t.shot('02-menu');
    const ember = await t.page.evaluate(() => P1.state.party[0].moves.findIndex((m) => m.id === 'ember') + 1);
    await t.click('[data-b="move-' + ember + '"]');
    const fxShot = t.page.waitForFunction(() => P1.battleScene.fx.some((f) => f.a && f.t > 0.35), null, { timeout: 20000 })
      .then(() => t.shot('03-ember-anim')).then(() => true, () => false);
    check(tag + ' Ember plays the PRO attack animation', await fxShot);
    const hpShot = t.page.waitForFunction(() => { const b = P1.battleScene.box.p2; return b && b.shown < b.max && b.shown > b.hp; }, null, { timeout: 20000 })
      .then(() => t.shot('04-hp-tween')).then(() => true, () => false);
    check(tag + ' foe HP bar tweens down after the hit', await hpShot);
    const levelShot = t.page.waitForFunction(() => P1.battleScene.logLines.some((l) => /lên cấp 8/.test(l)), null, { timeout: 90000 })
      .then(() => t.shot('05-level-up')).then(() => true, () => false);
    const expSeen = t.page.waitForFunction(() => { const b = P1.battleScene.box.p1; return b && b.exp > 0.02 && b.level === 8; }, null, { timeout: 90000 }).then(() => true, () => false);
    await fightToEnd(t);
    check(tag + ' level-up line shown in the battle log', await levelShot);
    check(tag + ' EXP bar refills after the level-up', await expSeen);
    await waitEnd(t);
    const r = await t.info();
    check(tag + ' wild battle ends in a win', r.result.outcome === 'win', JSON.stringify(r.result));
    check(tag + ' EXP gained lands in P1.state', r.exp > before.exp && r.result.exp > 0, before.exp + ' → ' + r.exp);
    check(tag + ' reached level 8', r.level === 8, r.level);
    const all = await t.page.evaluate(() => P1.battleScene.logAll);
    check(tag + ' log names the Pokémon and the move', all.includes('[ff6600]Charmander[-] dùng [ffff00]Ember[-]!') &&
      all.some((l) => /\[ff6600\]Pidgey\[-\] gục ngã!/.test(l)), all.slice(0, 6).join(' | '));
    await t.shot('06-win');
    await t.page.close();
  }

  if (want('learn')) {
    // Charmander Lv15 (đủ 4 chiêu) lên 16: hộp học chiêu của menus.js, quên chiêu đầu để học Dragon Rage.
    const t = await open(browser, base, W, H, 'battle=16:3&party=4:15', errors);
    await t.mode('menu');
    await t.page.evaluate(() => { const m = P1.state.party[0]; m.exp = P1.mon.expAt(4, 16) - 1; });
    let learned = false;
    await fightToEnd(t, async (m) => {
      if (m !== 'learn') return;
      await t.page.waitForSelector('[data-p1="learn-forget-0"]', { timeout: 20000 });
      await t.shot('07-learn-move');
      await t.click('[data-p1="learn-forget-0"]');
      learned = true;
    });
    await waitEnd(t);
    const lv = await t.page.evaluate(() => ({ level: P1.state.party[0].level, moves: P1.state.party[0].moves.map((m) => m.id) }));
    check(tag + ' learn-move prompt replaced a move with Dragon Rage', learned && lv.level === 16 && lv.moves.includes('dragonrage') && lv.moves.length === 4, lv.moves.join(','));
    await t.page.close();
  }

  if (want('catch')) {
    const t = await open(browser, base, W, H, 'battle=19:4&party=4:12', errors);
    await t.mode('menu');
    await t.page.evaluate(() => { P1.state.bag.masterball = 1; P1.state.bag.potion = 2; });
    const dexBefore = await t.page.evaluate(() => !!P1.state.dex.caught[19]);
    await t.click('[data-b="item"]');
    await t.mode('items');
    await t.shot('08-items');
    await t.click('[data-b="item-masterball"]');
    await t.page.waitForFunction(() => P1.battleScene.catchPhase === 'shake1', null, { timeout: 30000 });
    await t.page.waitForTimeout(120);
    await t.shot('09-catch-shake');
    await t.page.waitForFunction(() => P1.battleScene.catchPhase === 'caught', null, { timeout: 30000 });
    await t.shot('10-caught');
    await waitEnd(t);
    const r = await t.info();
    const st = await t.page.evaluate(() => ({ caught: !!P1.state.dex.caught[19], balls: P1.state.bag.masterball, last: P1.state.party[P1.state.party.length - 1].dex }));
    check(tag + ' Master Ball catches', r.result.outcome === 'caught', JSON.stringify(r.result.outcome));
    check(tag + ' party grows with the caught Rattata', r.party === 2 && st.last === 19, r.party + ' / ' + st.last);
    check(tag + ' dex marks Rattata caught', !dexBefore && st.caught);
    check(tag + ' Master Ball consumed', st.balls === 0, st.balls);
    await t.page.close();
  }

  if (want('trainer')) {
    const t = await open(browser, base, W, H, 'battle=19:3,16:3&party=4:16&trainer=Joey', errors);
    await t.mode('menu');
    const money0 = (await t.info()).money;
    const runOff = await t.page.evaluate(() => document.querySelector('[data-b="run"]').classList.contains('off'));
    let sentShot = false;
    await fightToEnd(t, async (m) => {
      if (m === 'menu' && !sentShot && (await t.page.evaluate(() => P1.battleScene.actors.p2.mon.dex)) === 16) {
        await t.shot('11-trainer-second');
        sentShot = true;
      }
    });
    await waitEnd(t);
    const r = await t.info();
    check(tag + ' trainer sends out Pidgey after Rattata faints', sentShot && (await t.page.evaluate(() => !!P1.state.dex.seen[16])));
    check(tag + ' trainer battle ends in a win with prize money', r.result.outcome === 'win' && r.money > money0, money0 + ' → ' + r.money);
    check(tag + ' Run is disabled against a trainer', runOff);
    await t.shot('12-trainer-win');
    await t.page.close();
  }

  if (want('faint')) {
    // Caterpie 1 HP gục → chọn con ra sân (forced) → Charmander vào và thắng.
    const t = await open(browser, base, W, H, 'battle=16:4&party=10:3,4:14', errors);
    await t.mode('menu');
    await t.page.evaluate(() => { const s = P1.battleScene; s.battle.simMon('p1', 0).hp = 1; s.box.p1.hp = s.box.p1.shown = 1; });
    let forced = false;
    for (let i = 0; i < 12 && !forced; i++) {
      await t.modeIn(['menu', 'forced']);
      if ((await t.info()).mode === 'forced') { forced = true; break; }
      const shot = await t.page.evaluate(() => P1.state.party[0].moves.findIndex((m) => m.id === 'stringshot') + 1 || 1);
      await t.click('[data-b="move-' + shot + '"]');
      await t.page.waitForFunction(() => !P1.battleScene.pick, null, { timeout: 10000 });
    }
    check(tag + ' fainted lead forces a switch', forced);
    await t.shot('13-forced-switch');
    await t.click('[data-b="party-1"]');
    await t.page.waitForFunction(() => P1.battleScene.actors.p1.mon && P1.battleScene.actors.p1.mon.dex === 4 && !P1.battleScene.actors.p1.hidden, null, { timeout: 30000 });
    await t.mode('menu');
    await t.shot('14-after-switch');
    await fightToEnd(t);
    await waitEnd(t);
    const r = await t.info();
    check(tag + ' Charmander finishes the battle after the switch', r.result.outcome === 'win', JSON.stringify(r.result.outcome));
    await t.page.close();
  }

  if (want('run')) {
    const t = await open(browser, base, W, H, 'battle=16:2&party=4:12,1:5', errors);
    await t.mode('menu');
    await t.page.keyboard.press('Digit1');
    await t.page.waitForFunction(() => !P1.battleScene.pick, null, { timeout: 10000 });
    check(tag + ' keyboard 1 picks the first move', true);
    await t.mode('menu');
    await t.click('[data-b="pokemon"]');
    await t.mode('party');
    await t.page.keyboard.press('Escape');
    await t.mode('menu');
    check(tag + ' Esc closes the party grid', true);
    await t.click('[data-b="run"]');
    await waitEnd(t);
    const r = await t.info();
    check(tag + ' Run escapes a wild battle', r.result.outcome === 'ran', JSON.stringify(r.result.outcome));
    await t.page.close();
  }

  if (want('boss')) {
    // Boss giả: máu chung = maxHp − (phần mình báo) − (phần người khác), như raid.js.
    const t = await open(browser, base, W, H, 'battle=16:2&party=4:12', errors);
    await t.mode('menu');
    const proSfx = fs.existsSync(path.join(ROOT, 'games/pokeone/audio/pro/battle/damagenormal.ogg'));
    const sfxHits = [];
    t.page.on('request', (q) => { if (/audio\/pro\/battle\//.test(q.url())) sfxHits.push(q.url()); });
    await t.page.evaluate((proSfx) => {
      // Khoá như tools/pro/rip_pro.py ghi vào P1.PRO.sfx ('battle.<slug>').
      if (proSfx) P1.PRO.sfx['battle.damagenormal'] = 'audio/pro/battle/damagenormal.ogg';
      P1.state.party = [P1.mon.create(6, 45, { ot: 'Debug' })];
      P1.state.bag.pokeball = 3;
      const boss = window.__boss = { maxHp: 2400, mine: 0, others: 0, reports: [], over: false,
        sharedHp() { return Math.max(0, this.maxHp - this.mine - this.others); },
        report(d) { this.reports.push(d); this.mine = Math.max(this.mine, d); },
        ended() { return this.over; } };
      window.__out = null;
      P1.scene.go('battle', { kind: 'boss', foe: [P1.mon.create(143, 30)], boss, bg: 'forest', onEnd: (o) => { window.__out = o; } });
    }, proSfx);
    await t.page.waitForFunction(() => P1.battleScene.kind === 'boss', null, { timeout: 20000 });
    await introDone(t);
    await t.mode('menu');
    const s0 = await t.page.evaluate(() => ({ max: P1.battleScene.battle.simMon('p2', 0).maxhp, label: document.querySelector('[data-b="run"]').textContent }));
    check(tag + ' boss HP set from boss.maxHp', s0.max === 2400, s0.max);
    check(tag + ' Run becomes "Rời trận" in a boss battle', /Rời trận/.test(s0.label), s0.label);
    await t.shot('15-boss');
    await t.click('[data-b="item"]');
    await t.mode('items');
    await t.click('[data-b="tab-ball"]');
    await t.click('[data-b="item-pokeball"]');
    const noBall = await t.page.evaluate(() => ({ mode: P1.battleScene.mode, balls: P1.state.bag.pokeball }));
    check(tag + ' no ball can be thrown at a boss', noBall.mode === 'items' && noBall.balls === 3, JSON.stringify(noBall));
    await t.click('[data-b="fight"]');
    await t.mode('menu');
    await attack(t);
    await t.mode('menu');
    const s1 = await t.page.evaluate(() => ({ reports: __boss.reports.slice(), dealt: P1.battleScene.battle.dealt, local: P1.battleScene.battle.simMon('p2', 0).hp, shared: __boss.sharedHp() }));
    if (proSfx) check(tag + ' hit sound comes from P1.PRO.sfx when mapped', sfxHits.some((u) => /damagenormal\.ogg$/.test(u)), sfxHits.join(' '));
    check(tag + ' each turn reports cumulative damage dealt', s1.reports.length >= 2 && s1.reports[s1.reports.length - 1] === s1.dealt && s1.dealt > 0, JSON.stringify(s1));
    await t.page.evaluate(() => { __boss.others = 1500; });
    await t.page.waitForFunction(() => Math.abs(P1.battleScene.shownBossHp - __boss.sharedHp()) < 5, null, { timeout: 10000 });
    await t.shot('16-boss-shared-hp');
    await attack(t);
    await t.mode('menu');
    const s2 = await t.page.evaluate(() => ({ local: P1.battleScene.battle.simMon('p2', 0).hp, shared: __boss.sharedHp() }));
    check(tag + ' local boss HP lowered to the shared HP', s2.local <= s2.shared && s2.local < 2400 - 1500, JSON.stringify(s2));
    await t.page.evaluate(() => { __boss.others = 2400; });
    await t.page.waitForFunction(() => window.__out, null, { timeout: 30000 });
    const o = await t.page.evaluate(() => ({ out: window.__out, dealt: P1.battleScene.battle.dealt }));
    check(tag + ' shared HP at 0 ends the boss battle as a win', o.out.outcome === 'win' && o.out.dealt === o.dealt, JSON.stringify(o));
    await t.page.close();
  }

  check(tag + ' no page errors, console errors or HTTP ≥ 400', errors.length === 0, errors.slice(0, 5).join(' | '));
}

(async () => {
  const srv = await serve();
  const base = process.env.BASE || 'http://127.0.0.1:' + srv.address().port;   // BASE=<url Pages> để kiểm bản trên mạng
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const [W, H] of SIZES) await scenarios(browser, base, W, H);
  } catch (e) {
    check('run finished', false, e.stack.split('\n').slice(0, 3).join(' '));
  }
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed — shots in ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
