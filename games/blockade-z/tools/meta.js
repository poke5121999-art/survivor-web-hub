// Home meta layer: wishes, pity, hero level and stars, the pretend shop, VIP, locked heroes on the pick screen, run payout.
// Loads ?meta=1 so the layer is live under the test driver. Screenshots go to outDir.
// Usage: PLAYWRIGHT_PATH=<playwright-core> node games/blockade-z/tools/meta.js [outDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.meta-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'meta@test' })); localStorage.removeItem('blockadez.meta.v1'); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&meta=1&nolock=1&seed=5&noaudio=1&tod=0.45&weather=clear');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const ev = (s) => page.evaluate(s);
    const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });

    check(await ev('__meta.live === true'), 'meta layer is live with ?meta=1');
    check(await ev("!!document.querySelector('#meta-bar .mm-cur')"), 'title shows VIP, gold and gems');
    await shot('01-title');

    await page.click('[data-mm="open:gacha"]'); await page.waitForTimeout(300);
    check(await ev("document.querySelector('#meta').classList.contains('on') && !!document.querySelector('.mm-banner img')"), 'wish tab opens with the featured hero portrait');
    await shot('02-gacha');
    const g0 = await ev('__meta.S.gems');
    await page.click('[data-mm="wish:10"]'); await page.waitForTimeout(2200);
    const r10 = await ev("({ n: document.querySelectorAll('#mm-cards .mm-card').length, hi: document.querySelectorAll('#mm-cards .mm-card.sr, #mm-cards .mm-card.ssr').length, gems: __meta.S.gems, pulls: __meta.S.pulls })");
    check(r10.n === 10 && r10.pulls === 10, `ten wishes show ten cards (${r10.n}, pulls ${r10.pulls})`);
    check(r10.gems === g0 + 100 - 1350 || r10.gems === g0 - 1350, `ten wishes cost 1350 gems (${g0} -> ${r10.gems})`);
    check(r10.hi >= 1, `ten wishes give at least one SR or better (${r10.hi})`);
    await shot('03-reveal10');
    await page.click('[data-mm="rclose"]');

    await ev('(() => { const s = __meta.S; s.pity = 59; s.gems = 5000; __meta.S = s; })()');
    const before = await ev('Object.values(__meta.S.heroes).reduce((a, h) => a + (h.own ? 100 : 0) + h.shard, 0)');
    await page.click('[data-mm="wish:1"]'); await page.waitForTimeout(1200);
    const ssr = await ev("({ ssr: document.querySelectorAll('#mm-cards .mm-card.ssr').length, pity: __meta.S.pity, after: Object.values(__meta.S.heroes).reduce((a, h) => a + (h.own ? 100 : 0) + h.shard, 0) })");
    check(ssr.ssr === 1 && ssr.pity === 0, `the 60th wish is a guaranteed SSR and pity resets (${JSON.stringify(ssr)})`);
    check(ssr.after - before >= 25, 'the SSR gave a hero or 25 shards');
    await shot('04-reveal-ssr');
    await page.click('[data-mm="rclose"]');

    await page.click('[data-mm="tab:heroes"]'); await page.waitForTimeout(200);
    await ev('(() => { const s = __meta.S; s.gold = 100000; s.heroes.mua.shard = 30; __meta.S = s; })()');
    await page.click('[data-mm="hero:mua"]');
    await page.click('[data-mm="lv:mua:10"]'); await page.waitForTimeout(100);
    const lv = await ev('__meta.S.heroes.mua.lv');
    check(lv === 10, `level up to the star cap: 10 levels at 0 stars (lv ${lv})`);
    await page.click('[data-mm="star:mua"]'); await page.waitForTimeout(100);
    const st = await ev('({ star: __meta.S.heroes.mua.star, shard: __meta.S.heroes.mua.shard, dmg: __meta.dmgMul("mua"), hp: __meta.hpMul("mua") })');
    check(st.star === 1 && st.shard === 20, `one star costs 10 shards (${JSON.stringify(st)})`);
    check(Math.abs(st.dmg - (1 + 0.035 * 9 + 0.12)) < 1e-6 && Math.abs(st.hp - (1 + 0.025 * 9 + 0.08)) < 1e-6, 'level 10 star 1 multiplies damage x1.435 and health x1.305');
    await shot('05-heroes');

    await page.click('[data-mm="tab:shop"]'); await page.waitForTimeout(200);
    await shot('06-shop');
    const s0 = await ev('({ gems: __meta.S.gems, spent: __meta.S.spent })');
    await page.click('[data-mm="buy:g60"]'); await page.waitForTimeout(150);
    check(await ev("document.querySelector('#mm-modal').classList.contains('on') && /giả lập/.test(document.querySelector('#mm-modal').textContent) && !document.querySelector('#mm-modal input')"), 'buying opens a pretend checkout with no input fields');
    await shot('07-pay');
    await page.click('[data-mm="pay"]'); await page.waitForTimeout(1000);
    const s1 = await ev('({ gems: __meta.S.gems, spent: __meta.S.spent })');
    check(s1.gems - s0.gems === 120 && s1.spent - s0.spent === 22000, `first 60-gem pack pays double: +${s1.gems - s0.gems} gems, +${s1.spent - s0.spent}đ`);
    await shot('08-paid');
    await page.click('#mm-modal [data-mm="close"]');
    await ev("__meta.grant('g8080'); __meta.grant('g8080')");
    check(await ev("document.querySelector('#mm-vip').textContent") === 'VIP 4', 'spending 4.002.000đ in pretend money reaches VIP 4');

    await page.click('[data-mm="back"]'); await page.waitForTimeout(200);
    check(await ev("__G.state === 'title' && document.querySelector('#title').classList.contains('on')"), 'back returns to the title');

    await ev("__select.open(); __select.pick(BZ.HEROES.findIndex((h) => !__meta.owns(h.id))); __sim(0.4)");
    const lk = await ev("({ locks: document.querySelectorAll('#sel-row button.lock').length, go: document.querySelector('[data-act=selgo]').textContent })");
    check(lk.locks >= 1 && lk.go === 'Mở khoá', `pick screen marks locked heroes (${JSON.stringify(lk)})`);
    await page.click('[data-act="selgo"]'); await page.waitForTimeout(200);
    check(await ev("__G.state === 'select' && document.querySelector('#mm-modal').classList.contains('on')"), 'entering with a locked hero opens the unlock box instead of a fight');
    await shot('09-locked');
    await page.click('[data-mm="lk:gems"]'); await page.waitForTimeout(300);
    const unl = await ev("({ own: __meta.owns(BZ.HEROES[__select.lineup.i].id), go: document.querySelector('[data-act=selgo]').textContent })");
    check(unl.own && unl.go === 'Vào trận', `unlocking with gems makes the hero playable (${JSON.stringify(unl)})`);

    await ev('__select.pick(BZ.HEROES.findIndex((h) => h.id === "mua")); __select.go(); __sim(0.3)');
    const hp = await ev('({ max: __G.player.maxHp, mul: __meta.hpMul("mua") })');
    check(hp.max === Math.round(100 * hp.mul), `the fight uses the upgraded health (${hp.max})`);
    const dmg = await ev(`(() => { const G = __G; G.zombies.clear(); G.wave.toSpawn = 0; G.wave.total = 999;
      const z = G.zombies.spawn('walker', 1, { x: 0, z: 0, dir: [0, 1] }); z.hp = z.maxHp = 5000; G.zombies.damage(z, 100, 'body', new THREE.Vector3(0, 0, 1));
      return { lost: 5000 - z.hp, mul: __meta.dmgMul('mua') }; })()`);
    check(Math.abs(dmg.lost - 100 * dmg.mul) < 0.01, `damage is scaled by level, stars and VIP (100 -> ${dmg.lost.toFixed(1)}, x${dmg.mul.toFixed(3)})`);

    const gold0 = await ev('__meta.S.gold');
    await ev("__G.wave.n = 6; __G.kills = 40; __G.events.emit('player:dead', { final: true })");
    const loot = await ev("({ gold: __meta.S.gold, txt: document.querySelector('#dead-loot').textContent })");
    check(loot.gold > gold0 && /vàng/.test(loot.txt), `a finished run pays gold (${loot.txt})`);
    await page.waitForTimeout(1100); await shot('10-dead');

    check(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  } finally { await br.close(); srv.close(); }
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
