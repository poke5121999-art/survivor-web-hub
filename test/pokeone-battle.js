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

/* Chiêu gây sát thương mạnh nhất còn PP, trong các nút đang hiện (chiêu hai lượt thì chỉ còn một nút). */
async function attack(t) {
  const slot = await t.page.evaluate(() => {
    let best = 1, bp = -1;
    document.querySelectorAll('.pb-move:not(.off)').forEach((el) => {
      const k = +el.dataset.b.slice(5), m = P1.battleScene.req.moves[k - 1];
      const power = m ? P1.Dex.moves.get(m.id).basePower : 0;
      if (power > bp) { bp = power; best = k; }
    });
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
  return s && s.fade === 0 && !s.actors.p1a.hidden && !s.actors.p2a.hidden && s.actors.p1a.scale === 1 && s.box.p1a && s.box.p1a.slide === 0;
}, null, { timeout: 60000 });

async function scenarios(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  console.log('\n[' + tag + ']');
  const errors = [];

  if (want('wild')) {
    // Charmander Lv7 đánh Pidgey Lv3: thắng, thanh EXP chạy, lên cấp 8.
    const t = await open(browser, base, W, H, 'battle=16:3&party=4:7', errors);
    await t.page.waitForFunction(() => P1.battleScene && P1.battleScene.actors && !P1.battleScene.actors.p2a.hidden && P1.battleScene.actors.p2a.tintA === 0, null, { timeout: 60000 });
    await t.shot('01-intro');
    await introDone(t);
    await t.mode('menu');
    const art = await t.page.evaluate(() => {
      const s = P1.battleScene;
      return { bg: !!P1.imgNow(s.bgUrl), foe: !!s.actors.p2a.img, me: !!s.actors.p1a.img, bgUrl: s.bgUrl };
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
    const hpShot = t.page.waitForFunction(() => { const b = P1.battleScene.box.p2a; return b && b.shown < b.max && b.shown > b.hp; }, null, { timeout: 20000 })
      .then(() => t.shot('04-hp-tween')).then(() => true, () => false);
    check(tag + ' foe HP bar tweens down after the hit', await hpShot);
    const levelShot = t.page.waitForFunction(() => P1.battleScene.logLines.some((l) => /lên cấp 8/.test(l)), null, { timeout: 90000 })
      .then(() => t.shot('05-level-up')).then(() => true, () => false);
    const expSeen = t.page.waitForFunction(() => { const b = P1.battleScene.box.p1a; return b && b.exp > 0.02 && b.level === 8; }, null, { timeout: 90000 }).then(() => true, () => false);
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
      if (m === 'menu' && !sentShot && (await t.page.evaluate(() => P1.battleScene.actors.p2a.mon.dex)) === 16) {
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
    await t.page.evaluate(() => { const s = P1.battleScene; s.battle.simMon('p1', 0).hp = 1; s.box.p1a.hp = s.box.p1a.shown = 1; });
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
    await t.page.waitForFunction(() => P1.battleScene.actors.p1a.mon && P1.battleScene.actors.p1a.mon.dex === 4 && !P1.battleScene.actors.p1a.hidden, null, { timeout: 30000 });
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
    // Trận boss chung với cầu nối giả (không mạng): mình ở ô a, đồng đội bot chọn sau 0,6 s; chủ phòng là máy này.
    for (const n of [1, 2, 3]) {
      const t = await open(browser, base, W, H, 'battle=16:2&party=4:12', errors);
      await t.mode('menu');
      await t.page.evaluate((n) => {
        P1.state.party = [P1.mon.create(6, 45, { ot: 'Debug' }), P1.mon.create(25, 40, { ot: 'Debug' })];
        const bots = [['misty', 'Misty', [[9, 44], [121, 40]]], ['brock', 'Brock', [[95, 42], [141, 40]]]].slice(0, n - 1);
        const players = [{ id: 'me', name: P1.state.player.name, mons: P1.state.party.slice() }]
          .concat(bots.map(([id, name, ms]) => ({ id, name, mons: ms.map(([d, l]) => P1.mon.create(d, l)) })));
        const cb = new P1.CoopBattle({ players, foes: P1.raid.trainerTeam('giovanni', 77), seed: 77 });
        const queue = [], waiters = [], picks = {}, ready = {};
        let left = false, botAt = -1;
        const wake = () => waiters.splice(0).forEach((f) => f());
        const commit = () => {
          const r = cb.apply(cb.decide(picks));
          Object.keys(picks).forEach((k) => delete picks[k]);
          queue.push(r.events); wake();
        };
        const mySlotsDone = () => { const q = cb.requestFor('me'); return !q || q.slots.every((s) => picks[s.slot]); };
        // Bot: chọn sau 0,6 s kể từ lúc lượt mới bắt đầu (để ảnh chụp thấy "đang chọn…").
        setInterval(() => {
          if (cb.result || left || queue.length) return;
          const n0 = cb.log.length;
          if (botAt !== n0) { botAt = n0; window.__botT = Date.now(); return; }
          if (Date.now() - window.__botT < 600 * (window.__botSlow || 1)) return;
          cb.controllers().forEach((id, slot) => { if (id && id !== 'me' && !picks[slot]) picks[slot] = { t: 'auto' }; });
          if (mySlotsDone()) commit();
        }, 100);
        window.__coop = cb; window.__picks = picks; window.__submitted = []; window.__botSlow = 50;
        window.__out = null;
        const driver = {
          battle: cb, me: 'me', intro: cb.begin(), names: Object.fromEntries(players.map((p) => [p.id, p.name])), turnMs: 30000,
          take: () => queue.shift() || null, over: () => !!cb.result || left,
          wait: () => new Promise((res) => { if (queue.length || cb.result || left) res(); else waiters.push(res); }),
          request: () => (queue.length ? null : cb.requestFor('me')),
          ready: (k) => ready[k] || (ready[k] = Date.now()),
          submit: (slot, pick) => { picks[slot] = pick; window.__submitted.push(JSON.stringify({ [slot]: pick })); },
          status: () => {
            const out = {};
            cb.controllers().forEach((id, slot) => { if (id) out[slot] = { id, name: driver.names[id], state: picks[slot] ? 'done' : 'choosing' }; });
            return out;
          },
          leave: () => { left = true; wake(); },
        };
        P1.scene.go('battle', { kind: 'boss', coop: driver, foe: cb.foes, name: 'Giovanni', bg: 'indoor', onEnd: (o) => { window.__out = o; } });
      }, n);
      await t.page.waitForFunction(() => P1.battleScene.coop, null, { timeout: 20000 });
      await t.page.waitForFunction(() => {
        const s = P1.battleScene;
        return s.fade === 0 && Object.values(s.actors).every((a) => !a.mon || (!a.hidden && a.scale === 1)) && s.mode === 'menu' && s.pick;
      }, null, { timeout: 60000 });
      const s0 = await t.page.evaluate(() => {
        const s = P1.battleScene, b = s.battle;
        return {
          actors: Object.keys(s.actors).filter((p) => s.actors[p].mon).sort().join(),
          foes: Object.keys(s.actors).filter((p) => p[1] === '2').map((p) => s.actors[p].mon.dex).join(),
          slots: s.coopReq.slots.map((x) => x.slot).join(),
          bench: s.coopReq.bench.map((x) => x.owner).join(), run: document.querySelector('[data-b="run"]').textContent,
          item: document.querySelector('[data-b="item"]').classList.contains('off'), timer: s.timerEl.textContent,
          format: b.sim.format.id,
        };
      });
      const want = { 1: 'p1a,p2a', 2: 'p1a,p1b,p2a,p2b', 3: 'p1a,p1b,p1c,p2a,p2b,p2c' }[n];
      check(tag + ' ' + n + 'p boss: ' + n + ' slots per side on screen (' + s0.format + ')', s0.actors === want, s0.actors);
      check(tag + ' ' + n + 'p boss: Giovanni leads with his first ' + n + ' Pokémon (FRLG order)', s0.foes === ['111', '51', '31'].slice(0, n).join(), s0.foes);
      check(tag + ' ' + n + 'p boss: I control only my slot; my bench is only mine', s0.slots === '0' && s0.bench.split(',').every((o) => o === 'me'), JSON.stringify(s0));
      check(tag + ' ' + n + 'p boss: Run reads "Rời trận", bag disabled, turn timer shown', /Rời trận/.test(s0.run) && s0.item && /^Còn \d+ s$/.test(s0.timer), s0.run + ' / ' + s0.timer);
      await t.shot('15-boss-' + n + 'p');
      // Chọn chiêu gây sát thương; đánh đôi/ba thì phải chọn mục tiêu (boss).
      const slot = await t.page.evaluate(() => {
        const sr = P1.battleScene.coopReq.slots[0];
        return sr.moves.find((m) => P1.Dex.moves.get(m.id).basePower > 0 && m.pp > 0).slot;
      });
      await t.click('[data-b="move-' + slot + '"]');
      if (n > 1) {
        await t.mode('target');
        const targets = await t.page.evaluate(() => [...document.querySelectorAll('.pb-target')].map((b) => b.dataset.b + ':' + b.textContent));
        check(tag + ' ' + n + 'p boss: target picker lists the foes first, then allies', targets.filter((x) => !/đồng đội/.test(x)).length >= 2 &&
          targets.findIndex((x) => /đồng đội/.test(x)) === targets.length - 1, targets.join(' | '));
        await t.shot('16-boss-' + n + 'p-target');
        await t.click('[data-b="target-' + (n === 3 ? 'p2b' : 'p2a') + '"]');
      }
      await t.page.waitForFunction(() => window.__submitted.length > 0, null, { timeout: 10000 });
      if (n > 1) await t.page.waitForFunction(() => P1.battleScene.mode === 'wait', null, { timeout: 10000 });
      const waitState = await t.page.evaluate(() => ({ prompt: P1.battleScene.promptEl.textContent, picks: window.__submitted[0] }));
      if (n > 1) {
        check(tag + ' ' + n + 'p boss: after my pick the panel waits for the allies ("Chờ … chọn")', /Chờ .*chọn/.test(waitState.prompt), waitState.prompt);
        await t.shot('17-boss-' + n + 'p-waiting');
      }
      check(tag + ' ' + n + 'p boss: my pick carries the chosen target', new RegExp('"0":\\{"t":"move","m":' + slot + ',"tg":' + (n === 1 ? 0 : n === 3 ? 2 : 1) + '\\}').test(waitState.picks), waitState.picks);
      await t.page.evaluate(() => { window.__botSlow = 1; });
      await t.page.waitForFunction(() => window.__coop.log.length >= 1 && P1.battleScene.mode !== 'wait', null, { timeout: 60000 });
      await t.shot('18-boss-' + n + 'p-turn');
      // Đánh tới hết bằng chiêu mạnh nhất vào boss.
      for (const t0 = Date.now(); Date.now() - t0 < 240000;) {
        const st = await t.page.evaluate(() => ({ mode: P1.battleScene.mode, pick: !!P1.battleScene.pick, out: window.__out }));
        if (st.out) break;
        if (st.pick && st.mode === 'menu') {
          await t.page.evaluate(() => {
            const s = P1.battleScene, sr = s.req;
            const m = sr.moves.filter((x) => !x.disabled && x.pp > 0).sort((a, b) => P1.Dex.moves.get(b.id).basePower - P1.Dex.moves.get(a.id).basePower)[0] || sr.moves[0];
            const boss = m.targets.find((x) => !x.ally && x.alive) || m.targets[0];
            s.send({ type: 'move', slot: m.slot, tg: boss ? boss.loc : 0 });
          });
        } else if (st.pick && st.mode === 'forced') {
          await t.page.evaluate(() => { const s = P1.battleScene; s.send({ type: 'switch', index: s.coopReq.bench[0].index }); });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      await t.page.waitForFunction(() => window.__out, null, { timeout: 120000 });
      const o = await t.page.evaluate(() => ({ out: window.__out, result: window.__coop.result, turns: window.__coop.turn }));
      check(tag + ' ' + n + 'p boss: shared battle reaches a result and hands it to onEnd', o.out.outcome === (o.result === 'win' ? 'win' : 'lose'), JSON.stringify(o));
      await t.page.close();
    }
  }

  if (want('solo-boss')) {
    // Đánh một mình = trận huấn luyện viên thường với đội Brock; thắng → tiền FRLG, vật phẩm, trứng Onix, hồi 12 ngày.
    const t = await open(browser, base, W, H, 'battle=16:2&party=4:12', errors);
    await t.mode('menu');
    const before = await t.page.evaluate(() => {
      P1.state.party = [P1.mon.create(9, 40, { ot: 'Debug' })];
      P1.state.bossWins = {};
      window.__world = false;
      P1.scene.add('world', { enter() { window.__world = true; }, render() {} });
      P1.scene.name = P1.scene.name;
      return { money: P1.state.money, bag: P1.state.bag.superpotion | 0, n: P1.state.party.length };
    });
    await t.page.evaluate(() => { P1.scene.go('world', {}).then(() => { window.__world = false; P1.raid.soloFight('brock'); }); });
    await t.page.waitForFunction(() => P1.battleScene.kind === 'trainer' && P1.battleScene.args.name === 'Brock', null, { timeout: 20000 });
    const foe = await t.page.evaluate(() => P1.battleScene.args.foe.map((m) => m.dex + ':' + m.level).join());
    check(tag + ' solo boss: Brock fields his FRLG team (Geodude 12, Onix 14)', foe === '74:12,95:14', foe);
    await fightToEnd(t);
    await t.page.waitForFunction(() => window.__world === true, null, { timeout: 60000 });
    const after = await t.page.evaluate(() => ({ money: P1.state.money, bag: P1.state.bag.superpotion | 0, n: P1.state.party.length,
      egg: P1.state.party.slice(-1)[0] && P1.state.party.slice(-1)[0].dex + ':' + P1.state.party.slice(-1)[0].level, cd: P1.raid.cooldownLeft('brock') }));
    check(tag + ' solo boss win: ₽1400 prize, Super Potion ×5, an Onix egg hatched at Lv5, 12-day cooldown',
      after.money - before.money === 1400 && after.bag - before.bag === 5 && after.n === before.n + 1 && after.egg === '95:5' && after.cd > 11.9 * 864e5, JSON.stringify(after));
    const refused = await t.page.evaluate(() => {
      const said = [], t0 = P1.social.toast;
      P1.social.toast = (m) => said.push(m);
      P1.raid.soloFight('brock');
      P1.social.toast = t0;
      return { scene: P1.scene.name, said: said.join(' | ') };
    });
    check(tag + ' solo boss: a second challenge during the cooldown is refused (in the world, with the days left)', refused.scene === 'world' && /Còn 12 ngày/.test(refused.said), JSON.stringify(refused));
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
