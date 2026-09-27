/*
 * PokéOne — cảnh trận (games/pokeone/js/battle.js, js/fx.js, data/battle.js), bấm chuột thật trên nút NGUI.
 *
 * Chạy:  node test/pokeone-battle.js
 * Ảnh ra SHOTS (mặc định %TEMP%/pokeone-battle-shots): mở màn, chọn chiêu, VFX giữa chừng, bóng lắc, lên cấp,
 * học chiêu, đổi con của huấn luyện viên — ở 1280x720 và 844x390. Mở ra xem.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-battle-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.css': 'text/css', '.json': 'application/json' };
const SPEED = process.env.BSPEED || '2';

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail != null ? '  — ' + detail : ''));
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
  const api = {
    page,
    tag: W + 'x' + H,
    shot: (name) => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + name + '.png') }),
    mode: (m, t) => page.waitForFunction((m) => P1.battleScene && P1.battleScene.mode === m, m, { timeout: t || 90000 }),
    modeIn: (ms, t) => page.waitForFunction((ms) => P1.battleScene && ms.includes(P1.battleScene.mode), ms, { timeout: t || 90000 }),
    btn: (name) => page.locator('[data-panel="BattlePanel"] .p1ng-hit[data-name="' + name + '"]:visible').first(),
    info: () => page.evaluate(() => {
      const s = P1.battleScene;
      return { mode: s.mode, result: s.result || null, log: s.hud.logLines.slice(), party: P1.state.party.length,
        exp: P1.state.party[0].exp, level: P1.state.party[0].level, money: P1.state.money };
    }),
  };
  // Nút NGUI là div có collider; kiểm điểm giữa nút đúng là nút đó (không bị lớp khác đè).
  api.click = async (name) => {
    const b = api.btn(name);
    const box = await b.boundingBox();
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.dataset.name; }, [box.x + box.width / 2, box.y + box.height / 2]);
    if (hit !== name) throw new Error('click on "' + name + '" lands on "' + hit + '"');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };
  return api;
}

/* Chọn chiêu gây sát thương mạnh nhất còn PP, bấm Fight rồi bấm nút chiêu. */
async function attack(t) {
  await t.click('Button - Attack');
  await t.mode('moves');
  const slot = await t.page.evaluate(() => {
    const s = P1.battleScene, act = s.battle.active('p1'), sim = s.battle.simMon('p1', act.index);
    let best = 1, bp = -1;
    act.mon.moves.forEach((m, k) => { const mv = P1.Dex.moves.get(m.id); if (sim.moveSlots[k].pp > 0 && mv.basePower > bp) { bp = mv.basePower; best = k + 1; } });
    return best;
  });
  await t.click('Button - Attack ' + slot);
}

async function fightToEnd(t, onTurn) {
  for (let turn = 0; turn < 40; turn++) {
    await t.modeIn(['menu', 'forced', 'learn', 'end']);
    const m = (await t.info()).mode;
    if (m === 'end') return;
    if (m === 'learn') { await onTurn('learn'); continue; }
    if (m === 'forced') {
      const n = await t.page.evaluate(() => P1.battleScene.battle.switchable()[0].index);
      await t.page.locator('[data-panel="BattlePanel"] .p1ng-hit[data-name^="Button - Pokemon"]:visible').nth(n).click();
      continue;
    }
    if (onTurn) await onTurn('menu', turn);
    await attack(t);
  }
}

const waitEnd = (t) => t.page.waitForFunction(() => P1.battleScene && P1.battleScene.result, null, { timeout: 90000 });

async function scenarios(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const errors = [];

  // 1. Hoang dã, thắng, lên cấp 16, học Dragon Rage khi đã đủ 4 chiêu (learnset Gen 7: Dragon Rage ở cấp 16).
  {
    const t = await open(browser, base, W, H, 'battle=16:3&party=4:15', errors);
    await t.page.waitForFunction(() => P1.battleScene && P1.battleScene.fade && P1.battleScene.fade.style.display === 'none' && P1.battleScene.stage.slots.p2.root.scale.x > 0.9, null, { timeout: 60000 });
    await t.shot('01-intro');
    await t.mode('menu');
    const before = await t.page.evaluate(() => { const m = P1.state.party[0]; m.exp = P1.mon.expAt(4, 16) - 1; return { exp: m.exp, moves: m.moves.length }; });
    await t.shot('02-menu');
    await t.click('Button - Attack');
    await t.mode('moves');
    const slot = await t.page.evaluate(() => P1.state.party[0].moves.findIndex((m) => m.id === 'ember') + 1 || 1);
    if (W >= 1000) await t.btn('Button - Attack ' + slot).hover();
    await t.page.waitForTimeout(100);
    await t.shot('03-move-select');
    await t.click('Button - Attack ' + slot);
    await t.page.waitForFunction(() => P1.battleScene.stage.fx.length > 0, null, { timeout: 20000 });
    await t.page.waitForTimeout(120);
    await t.shot('04-vfx');
    let learned = false;
    const levelShot = t.page.waitForFunction(() => P1.battleScene.hud.logLines.some((l) => /grew to level/.test(l)), null, { timeout: 90000 })
      .then(() => t.shot('05-level-up')).then(() => true, () => false);
    await fightToEnd(t, async (m) => {
      if (m !== 'learn') return;
      await t.shot('06-learn-move');
      const btn = t.page.locator('[data-panel="Widget - Hidden During Battle Or Script"] .p1ng-hit[data-name="Button - Learn Move"]:visible').first();
      await btn.click();
      learned = true;
    });
    check(tag + ' level-up line shown in the battle log', await levelShot);
    await waitEnd(t);
    const r = await t.info();
    const lv = await t.page.evaluate(() => ({ level: P1.state.party[0].level, moves: P1.state.party[0].moves.map((m) => m.id) }));
    check(tag + ' wild battle ends in a win', r.result.outcome === 'win', JSON.stringify(r.result));
    check(tag + ' EXP gained lands in P1.state', r.exp > before.exp && r.result.exp > 0, before.exp + ' → ' + r.exp);
    check(tag + ' reached level 16', lv.level === 16, lv.level);
    check(tag + ' learn-move prompt replaced a move with Dragon Rage', learned && lv.moves.includes('dragonrage') && lv.moves.length === 4, lv.moves.join(','));
    const all = await t.page.evaluate(() => P1.battleScene.logAll);
    check(tag + ' log uses the original wording', all.includes('[ff6600]Charmander[-] used [ffff00]Ember[-]!') &&
      all.includes('[ff6600]Pidgey[-] fainted!') && !all.includes('Turn 1'), all.slice(0, 6).join(' | '));
    await t.shot('07-win');
    await t.page.close();
  }

  // 2. Bắt bằng Master Ball từ túi (thẻ Pokéball của Items).
  {
    const t = await open(browser, base, W, H, 'battle=19:4&party=4:12', errors);
    await t.mode('menu');
    await t.page.evaluate(() => { P1.state.bag.masterball = 1; });
    const dexBefore = await t.page.evaluate(() => !!P1.state.dex.caught[19]);
    await t.click('Button - Items');
    await t.mode('items');
    await t.shot('08-items');
    await t.page.locator('[data-panel="BattlePanel"] .p1ng-hit[data-name="item_masterball"]:visible').click();
    await t.page.waitForFunction(() => /threw/.test(P1.battleScene.hud.logLines.join()), null, { timeout: 20000 });
    await t.page.waitForFunction(() => P1.battleScene.catchPhase === 'shake1', null, { timeout: 30000 });
    await t.page.waitForTimeout(150);
    await t.shot('09-catch-shake');
    await waitEnd(t);
    await t.shot('10-caught');
    const r = await t.info();
    const st = await t.page.evaluate(() => ({ caught: !!P1.state.dex.caught[19], balls: P1.state.bag.masterball, last: P1.state.party[P1.state.party.length - 1].dex }));
    check(tag + ' Master Ball catches', r.result.outcome === 'caught', JSON.stringify(r.result.outcome));
    check(tag + ' party grows with the caught Rattata', r.party === 2 && st.last === 19, r.party + ' / ' + st.last);
    check(tag + ' dex marks Rattata caught', !dexBefore && st.caught);
    check(tag + ' Master Ball consumed', st.balls === 0, st.balls);
    await t.page.close();
  }

  // 3. Huấn luyện viên có 2 con: thấy con thứ hai ra sân, thắng, được tiền.
  {
    const t = await open(browser, base, W, H, 'battle=19:3,16:3&party=4:16&trainer=Joey', errors);
    await t.mode('menu');
    const money0 = (await t.info()).money;
    const runOff = await t.page.evaluate(() => P1.battleScene.hud.ui.need('Button - Run').state === 'disabled');
    let sentShot = false;
    await fightToEnd(t, async (m) => {
      if (m === 'menu' && !sentShot && (await t.page.evaluate(() => P1.battleScene.stage.slots.p2.mon && P1.battleScene.stage.slots.p2.mon.dex)) === 16) {
        await t.shot('11-trainer-second');
        sentShot = true;
      }
    });
    await waitEnd(t);
    const r = await t.info();
    const sent = await t.page.evaluate(() => ({ seen: !!P1.state.dex.seen[16], name: P1.battleScene.hud.ui.need('Battle Window/FoeHealth/lblPokemonname').w.text }));
    check(tag + ' trainer sends out Pidgey after Rattata faints', sentShot && sent.seen && /Pidgey/.test(sent.name), JSON.stringify(sent));
    check(tag + ' trainer battle ends in a win with prize money', r.result.outcome === 'win' && r.money > money0, money0 + ' → ' + r.money);
    check(tag + ' Run is disabled against a trainer', runOff);
    await t.shot('12-trainer-win');
    await t.page.close();
  }

  // 4. Thua.
  {
    const t = await open(browser, base, W, H, 'battle=150:70&party=10:2', errors);
    await fightToEnd(t);
    await waitEnd(t);
    const r = await t.info();
    check(tag + ' hopeless battle ends in a loss', r.result.outcome === 'lose', JSON.stringify(r.result.outcome));
    await t.shot('13-lose');
    await t.page.close();
  }

  // 5. Bỏ chạy (Charmander Lv12 nhanh hơn Pidgey Lv2 nên chắc chắn thoát).
  {
    const t = await open(browser, base, W, H, 'battle=16:2&party=4:12', errors);
    await t.mode('menu');
    await t.click('Button - Run');
    await waitEnd(t);
    const r = await t.info();
    check(tag + ' Run escapes a wild battle', r.result.outcome === 'ran', JSON.stringify(r.result.outcome));
    await t.page.close();
  }

  // 6. Phím: Enter mở Fight, phím 1 chọn chiêu.
  {
    const t = await open(browser, base, W, H, 'battle=16:2&party=4:12', errors);
    await t.mode('menu');
    await t.page.keyboard.press('Enter');
    await t.mode('moves');
    await t.page.keyboard.press('Escape');
    await t.mode('menu');
    await t.page.keyboard.press('Enter');
    await t.page.keyboard.press('1');
    await t.mode('busy');
    check(tag + ' keyboard: Enter → moves, Esc → back, 1 → move', true);
    await t.page.close();
  }

  check(tag + ' no page errors, console errors or HTTP ≥ 400', errors.length === 0, errors.slice(0, 5).join(' | '));
}

(async () => {
  const srv = await serve();
  const base = process.env.BASE || 'http://127.0.0.1:' + srv.address().port;   // BASE=<url Pages> để kiểm bản trên mạng
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await scenarios(browser, base, 1280, 720);
    await scenarios(browser, base, 844, 390);
  } catch (e) {
    check('run finished', false, e.stack.split('\n').slice(0, 3).join(' '));
  }
  await browser.close();
  srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed — shots in ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
