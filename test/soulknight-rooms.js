/*
 * Kiểm thử phòng đặc biệt của Hiệp Sĩ Linh Hồn (games/soulknight/js/rooms.js):
 * cửa hàng (mua vũ khí/bình bằng vàng), tượng (dâng vàng → kỹ năng kích hoạt hiệu ứng tượng),
 * giếng ước, và bảng chọn buff ở cổng 1-1 (giữ ở cổng, chọn bằng phím 1 / chuột) + tự chọn sau 4 s ở cổng 1-3.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-rooms.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-rooms/.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-rooms');
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

// Đứng ngay dưới vật tương tác thứ i rồi bấm E thật.
async function useInteract(p, i) {
  await p.evaluate(k => {
    const o = SK.G.interactables[k], pl = SK.G.player;
    pl.x = o.x; pl.y = o.y + 2;
  }, i);
  await sleep(120);
  const label = await p.evaluate(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await p.keyboard.press('KeyE');
  await sleep(150);
  return label;
}

async function enterStage(p, label, force) {
  await p.evaluate(([l, f]) => { Object.assign(SK_ROOMS.force, f); SK_GAME.debug.stage(l); }, [label, force]);
  await until(p, () => SK_GAME.phase === 'play', null, 4000);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  try {
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 8000 });
    await p.evaluate(() => SK_GAME.debug.seed(424242));
    await p.click('#sk-start');
    await until(p, () => SK_GAME.state === 'stage', null, 3000);
    await p.evaluate(() => SK_GAME.debug.god(true));

    // ---- cửa hàng
    await enterStage(p, '1-3', { chest: 'shop', special: 'statue' });
    const shopFill = await p.evaluate(() => SK.G.map.rooms.find(r => r.type === 'chest').fill);
    check('phòng rương vàng ở 1-3 thành cửa hàng', shopFill === 'shop', 'fill=' + shopFill);
    await p.evaluate(() => { SK_GAME.debug.teleportTo('chest'); SK.G.player.gold = 500; SK.G.player.hp = 2; SK.G.player.energy = 10; });
    await sleep(400);
    const shop = await p.evaluate(() => SK.G.interactables.map((o, i) => ({ i, label: o.label, x: o.x, y: o.y })).filter(o => /^Mua/.test(o.label)));
    check('cửa hàng bày 3 món có giá', shop.length === 3, shop.map(o => o.label).join(' | '));
    await p.evaluate(() => { const o = SK.G.interactables.find(q => /^Mua/.test(q.label)); SK.G.player.x = o.x; SK.G.player.y = o.y + 6; });
    await sleep(500);
    await p.screenshot({ path: path.join(SHOTS, 'shop.png') });
    for (const it of shop) {
      const before = await p.evaluate(() => { const q = SK_GAME.player; return { gold: q.gold, hp: q.hp, energy: q.energy, weapons: q.weapons.join('/') }; });
      const price = +/\((\d+) vàng\)/.exec(it.label)[1];
      const shown = await useInteract(p, it.i);
      const after = await p.evaluate(() => { const q = SK_GAME.player; return { gold: q.gold, hp: q.hp, energy: q.energy, weapons: q.weapons.join('/') }; });
      const gotSomething = after.weapons !== before.weapons || after.hp > before.hp || after.energy > before.energy;
      check('mua "' + it.label + '"', shown === it.label && after.gold === before.gold - price && gotSomething,
        'vàng ' + before.gold + '→' + after.gold + ' · máu ' + before.hp + '→' + after.hp + ' · nl ' + before.energy + '→' + after.energy + ' · súng ' + after.weapons);
    }
    const soldOut = await p.evaluate(() => SK.G.interactables.filter(o => /^Mua/.test(o.label) && !o.gone).length);
    check('món đã mua biến khỏi quầy', soldOut === 0, 'còn ' + soldOut);

    // ---- tượng (world.js chỉ sinh phòng dấu chấm than một nửa số màn: vào lại tới khi có)
    let stFill = false;
    for (let k = 0; k < 8 && !stFill; k++) {
      await enterStage(p, '1-3', { special: 'statue' });
      stFill = await p.evaluate(() => !!SK.G.map.rooms.find(r => r.type === 'special'));
    }
    if (stFill) {
      const fill = await p.evaluate(() => SK.G.map.rooms.find(r => r.type === 'special').fill);
      check('phòng dấu chấm than thành phòng tượng', /^statue_\d$/.test(fill), fill);
      await p.evaluate(() => { SK_GAME.debug.teleportTo('special'); SK.G.player.gold = 100; SK.G.player.skillCd = 0; });
      await sleep(400);
      const si = await p.evaluate(() => SK.G.interactables.findIndex(o => /^Tượng/.test(o.label)));
      await p.evaluate(k => { const o = SK.G.interactables[k]; SK.G.player.x = o.x; SK.G.player.y = o.y + 8; }, si);
      await sleep(300);
      await p.screenshot({ path: path.join(SHOTS, 'statue.png') });
      const lbl = await useInteract(p, si);
      const st = await p.evaluate(() => ({ statue: SK.G.player.statue, gold: SK.G.player.gold }));
      check('dâng vàng cho tượng → nhận hiệu ứng tượng', !!st.statue && st.gold === 85, lbl + ' · vàng 100→' + st.gold + ' · tượng ' + st.statue);
      await p.evaluate(() => { window.__statueFired = 0; SK.on('statueFire', () => { window.__statueFired++; }); });
      await p.keyboard.press('KeyK');
      await sleep(250);
      await p.screenshot({ path: path.join(SHOTS, 'statue-fire.png') });
      const fired = await p.evaluate(() => ({ n: window.__statueFired, cd: SK.G.player.statueCd }));
      check('dùng kỹ năng kích hoạt hiệu ứng tượng, tượng vào hồi chiêu', fired.n === 1 && fired.cd > 0, 'lần ' + fired.n + ' · hồi ' + fired.cd.toFixed(1) + 's');
    } else check('màn 1-3 có phòng dấu chấm than', false, 'world.js không sinh phòng special ở hạt giống này');

    // ---- giếng ước
    let well = false;
    for (let k = 0; k < 6 && !well; k++) {
      await enterStage(p, '2-2', { special: 'well' });
      well = await p.evaluate(() => { const r = SK.G.map.rooms.find(q => q.type === 'special'); return !!r && r.fill === 'well'; });
    }
    if (well) {
      await p.evaluate(() => { SK_GAME.debug.teleportTo('special'); SK.G.player.gold = 20; });
      await sleep(300);
      const wi = await p.evaluate(() => SK.G.interactables.findIndex(o => /^Giếng/.test(o.label)));
      await p.evaluate(k => { const o = SK.G.interactables[k]; SK.G.player.x = o.x; SK.G.player.y = o.y + 4; }, wi);
      await sleep(300);
      await p.screenshot({ path: path.join(SHOTS, 'well.png') });
      await useInteract(p, wi);
      const g = await p.evaluate(() => SK.G.player.gold);
      check('ném xu xuống giếng ước trừ 1 vàng', g === 19, 'vàng 20→' + g);
    } else check('có phòng giếng ước để thử', false, 'không sinh được phòng special sau 6 lần');

    // ---- chọn buff ở cổng 1-1: giữ ở cổng tới khi chọn
    async function walkIntoPortal(label) {
      await enterStage(p, label, { chest: null, special: null });
      await p.evaluate(() => SK_GAME.debug.teleportTo('end'));
      await sleep(300);
      await p.keyboard.down('KeyW');
      const shown = await until(p, () => !(document.getElementById('sk-buffs') || { hidden: true }).hidden, null, 4000);
      await p.keyboard.up('KeyW');
      return shown;
    }
    const shown = await walkIntoPortal('1-1');
    await sleep(1500);
    await p.screenshot({ path: path.join(SHOTS, 'buff-choice.png') });
    const cards = await p.evaluate(() => [...document.querySelectorAll('#sk-buffs .skb-card')].map(c => c.dataset.buff));
    const held = await p.evaluate(() => ({ stage: SK_GAME.stage, phase: SK_GAME.phase, hold: SK.G.hold }));
    check('bước vào cổng 1-1 → hiện 3 buff, đứng ở cổng không sang màn', shown && cards.length === 3 && held.stage === '1-1' && held.phase === 'portal' && held.hold === true,
      cards.join(', ') + ' · ' + held.stage + '/' + held.phase);
    await p.keyboard.press('Digit1');
    const next = await until(p, () => SK_GAME.stage === '1-2', null, 2000);
    const pick1 = await p.evaluate(() => ({ buffs: SK.G.player.buffs.slice(), hidden: document.getElementById('sk-buffs').hidden }));
    check('bấm 1 → nhận buff thẻ đầu, bảng đóng, sang 1-2', next && pick1.hidden && pick1.buffs.length === 1 && pick1.buffs[0] === cards[0], pick1.buffs.join(','));

    // ---- không bấm gì ở cổng 1-3 → vẫn đứng chờ (game gốc không tự chọn), bấm 2 mới sang 1-4
    const shown3 = await walkIntoPortal('1-3');
    await sleep(6000);
    await p.screenshot({ path: path.join(SHOTS, 'buff-wait.png') });
    const wait3 = await p.evaluate(() => ({ stage: SK_GAME.stage, hold: SK.G.hold }));
    const cards3 = await p.evaluate(() => [...document.querySelectorAll('#sk-buffs .skb-card')].map(c => c.dataset.buff));
    await p.keyboard.press('Digit2');
    const go4 = await until(p, () => SK_GAME.stage === '1-4', null, 3000);
    const b3 = await p.evaluate(() => SK.G.player.buffs.slice());
    check('không bấm gì 6 s → vẫn đứng ở cổng 1-3; bấm 2 → nhận thẻ 2, sang 1-4',
      shown3 && wait3.stage === '1-3' && wait3.hold === true && go4 && b3[b3.length - 1] === cards3[1], wait3.stage + ' · ' + b3.join(','));
    await sleep(300);

    // Chọn bằng chuột với bộ thẻ định sẵn để đo chỉ số đổi thật.
    const ids = ['health', 'armor', 'energy'].filter(id => !pick1.buffs.includes(id));
    const s0 = await p.evaluate(() => ({ hpMax: SK.G.player.hpMax, armorMax: SK.G.player.armorMax, energyMax: SK.G.player.energyMax }));
    await p.evaluate(list => SK_ROOMS.openChoice(list), ids);
    await sleep(200);
    await p.click('#sk-buffs .skb-card:nth-child(2)');
    await sleep(200);
    const s1 = await p.evaluate(() => ({ hpMax: SK.G.player.hpMax, armorMax: SK.G.player.armorMax, energyMax: SK.G.player.energyMax, buffs: SK.G.player.buffs.slice() }));
    const want = { health: ['hpMax', 4], armor: ['armorMax', 1], energy: ['energyMax', 100] }[ids[1]];
    check('bấm chuột vào thẻ "' + ids[1] + '" → chỉ số đổi thật', s1[want[0]] === s0[want[0]] + want[1],
      want[0] + ' ' + s0[want[0]] + '→' + s1[want[0]] + ' · buff ' + s1.buffs.join(','));
    await p.evaluate(() => SK_ROOMS.takeBuff('shotgun'));
    const pel = await p.evaluate(() => {
      const W = SK_DESIGN.weapons, id = Object.keys(W).find(k => W[k].kind === 'gun' && W[k].pellets > 1);
      SK_GAME.debug.give(id);
      return { id, now: SK.G.player.weapons[1].def.pellets, base: W[id].pellets };
    });
    check('buff Mưa Đạn: súng chùm thêm 2 viên', pel.now === pel.base + 2, pel.id + ' ' + pel.base + '→' + pel.now);
    await sleep(300);
    await p.screenshot({ path: path.join(SHOTS, 'hud-buffs.png'), clip: { x: 0, y: 0, width: 640, height: 140 } });
  } catch (e) {
    check('chạy trọn', false, e.message.split('\n')[0]);
  }
  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n  ảnh: ' + SHOTS);
  console.log('═'.repeat(52));
  console.log('  ĐẠT ' + pass + '   HỎNG ' + fail);
  console.log('═'.repeat(52));
  process.exit(fail ? 1 : 0);
})();
