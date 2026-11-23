// Screenshot tour of every screen for the UI bug inventory: a brand-new account (FTUE steps, locked tabs) and a fully
// opened one (every beast owned, levelled, a full bag), at the S22, Xiaomi 17T and a 1280x720 desktop window.
// One PNG per state plus a contact sheet per size and account; the ids of the live targets go to tour.json.
// Usage: timeout 900 node games/ai-sinh-ton/tools/ui-tour.mjs [--out=DIR] [--only=s22]   Env: PHONES=s22,xiaomi,desktop
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, open as openPage, sheet, ROOT } from './pw.mjs';

const ARGS = process.argv.slice(2);
const OUT = path.resolve(ROOT, (ARGS.find((a) => a.startsWith('--out=')) || '--out=.chk/a10/uibug/tour').slice(6));
const PHONES = (process['env'].PHONES || 's22,xiaomi,desktop').split(',');
fs.mkdirSync(OUT, { recursive: true });
const open = (br, base, phone, q, o = {}) => openPage(br, base, phone, q, { ...o, freeze: true });
const step = (page, n) => page.evaluate((k) => __step(k), n);
const tap = async (page, id, n = 30) => { const ok = await page.evaluate((i) => __ui.tapId(i), id); await step(page, n); return ok; };
const ids = (page) => page.evaluate(() => __ui.targets().map((t) => t.id));
const log = {};

async function shoot(page, tag, name) {
  const f = path.join(OUT, `${tag}-${name}.png`);
  await page.screenshot({ path: f });
  log[tag] = log[tag] || []; log[tag].push({ name, file: path.basename(f), ids: await ids(page) });
  return f;
}

async function fullAccount(page) {
  await page.evaluate(async () => {
    const M = __G.meta, A = M.acc;
    const { HEROES } = await import('./js/data/heroes.js?v=20261122a');
    HEROES.forEach((h, i) => { A.heroes[h.id] = { level: 5 + ((i * 7) % 56), shards: (i * 13) % 90, form: 1, branch: null }; });
    A.team = HEROES.slice(0, 4).map((h) => h.id);
    A.cleared = 22; A.level = 34; A.gold = 1234567; A.gems = 98765; A.mergeOpen = true;
    A.bag = []; const mk = (item, tier, lv) => { const it = { uid: ++A.uidSeq, item, tier, lv }; A.bag.push(it); return it.uid; };
    const { ITEMS } = await import('./js/data/equip.js?v=20261122a');
    ITEMS.forEach((it, i) => { for (let t = 0; t < 3; t++) mk(it.id, (i + t) % 6, 1 + ((i * 5 + t * 3) % 30)); });
    for (let k = 0; k < 3; k++) mk(ITEMS[0].id, 0, 1);
    for (let c = 0; c < 4; c++) A.chapters[c] = c < 2;
    A.best = { 1: 63, 2: 71, 5: 140 };
    M.save(); __G.goto('home');
  });
  await step(page, 40);
}

async function meta(page, tag) {
  await shoot(page, tag, 'home');
  if (await tap(page, 'stage-prev')) await shoot(page, tag, 'home-prev-stage');
  if (await tap(page, 'view-chapter')) await shoot(page, tag, 'home-chapter');
  if (await tap(page, 'view-world')) await shoot(page, tag, 'home-world');
  await page.evaluate(() => __G.goto('home')); await step(page, 20);
  if (await tap(page, 'tab-heroes', 40)) {
    await shoot(page, tag, 'heroes');
    const h = (await ids(page)).filter((i) => /^hero-/.test(i));
    if (h[0]) { await tap(page, h[0], 40); await shoot(page, tag, 'hero-page'); }
    if (h[5]) { await tap(page, h[5], 40); await shoot(page, tag, 'hero-page-6'); }
    if (h[h.length - 1]) { await tap(page, h[h.length - 1], 40); await shoot(page, tag, 'hero-page-last'); }
    if (await tap(page, 'team-toggle', 40)) await shoot(page, tag, 'team-toggle');
    if ((await ids(page)).includes('replace-cancel')) { await tap(page, 'replace-cancel'); }
    if (await tap(page, 'levelup', 40)) await shoot(page, tag, 'levelup');
  }
  await page.evaluate(() => __G.goto('home')); await step(page, 20);
  if (await tap(page, 'tab-gacha', 40)) {
    await shoot(page, tag, 'gacha');
    if (await tap(page, 'rates', 40)) { await shoot(page, tag, 'gacha-rates'); await tap(page, 'rates-close'); }
    await page.evaluate(() => { __G.meta.acc.gems = Math.max(__G.meta.acc.gems, 5000); __G.meta.save(); });
    if (await tap(page, 'pull1', 10)) {
      for (let g = 0; g < 300 && (await page.evaluate(() => __G.metaUi.gachaPhase())) !== 'reveal'; g++) await step(page, 2);
      await step(page, 30); await shoot(page, tag, 'gacha-pull1');
      for (let g = 0; g < 300 && !['summary', 'idle'].includes(await page.evaluate(() => __G.metaUi.gachaPhase())); g++) { if (!(await tap(page, 'skip', 4))) await step(page, 4); }
      await step(page, 30); await shoot(page, tag, 'gacha-pull1-end');
      await tap(page, 'done', 30);
    }
    if (await tap(page, 'pull10', 10)) {
      for (let g = 0; g < 300 && (await page.evaluate(() => __G.metaUi.gachaPhase())) !== 'reveal'; g++) await step(page, 2);
      await step(page, 30); await shoot(page, tag, 'gacha-pull10-card1');
      for (let g = 0; g < 400 && (await page.evaluate(() => __G.metaUi.gachaPhase())) !== 'summary'; g++) { if (!(await tap(page, 'skip', 4))) await step(page, 4); }
      await step(page, 40); await shoot(page, tag, 'gacha-pull10-summary');
      await tap(page, 'done', 30);
    }
  }
  await page.evaluate(() => __G.goto('home')); await step(page, 20);
  if (await tap(page, 'tab-equip', 40)) {
    await shoot(page, tag, 'equip');
    const bag = (await ids(page)).filter((i) => /^bag-/.test(i));
    if (bag[0]) { await tap(page, bag[0], 40); await shoot(page, tag, 'equip-sheet'); await tap(page, 'sheet-close', 30); }
    if (await tap(page, 'merge', 30)) { await shoot(page, tag, 'equip-merge'); await tap(page, 'merge-cancel', 30); }
    if (await tap(page, 'auto', 30)) { await shoot(page, tag, 'equip-auto'); await tap(page, 'auto-cancel', 30); }
    if (await tap(page, 'hero-next', 30)) await shoot(page, tag, 'equip-hero2');
    await page.evaluate(() => __ui.node && __ui._scrolls && [...__ui._scrolls].forEach((s) => s.scrollTo && s.scrollTo(9999))); await step(page, 30);
    await shoot(page, tag, 'equip-scrolled');
  }
  await page.evaluate(() => __G.goto('home')); await step(page, 20);
  if (await tap(page, 'tab-rewards', 40)) await shoot(page, tag, 'rewards');
  await page.evaluate(() => __G.goto('home')); await step(page, 20);
  if (await tap(page, 'gear', 40)) {
    await shoot(page, tag, 'settings');
    if (await tap(page, 'acct-delete', 40)) { await shoot(page, tag, 'delete-account'); await tap(page, 'acct-cancel', 30); }
  }
  // revisit: open each tab a second time from home, the screen must look like the first visit
  await page.evaluate(() => __G.goto('home')); await step(page, 20);
  for (const t of ['tab-heroes', 'tab-equip', 'tab-gacha']) { await tap(page, t, 40); await shoot(page, tag, 'revisit-' + t.slice(4)); await page.evaluate(() => __G.goto('home')); await step(page, 20); }
  await shoot(page, tag, 'revisit-home');
}

async function battle(br, base, phone, tag, q) {
  const g = await open(br, base, phone, 'noaudio=1&q=low&autostart=1&stage=3&seed=7' + q); const { page } = g;
  await step(page, 30); await shoot(page, tag, 'hud-start');
  await page.evaluate(() => { __sim(6); }); await step(page, 20); await shoot(page, tag, 'hud-fight');
  await page.evaluate(() => { const B = __G.B; let k = 0; while (B.phase === 'fight' && k++ < 200) __sim(2); }); await step(page, 50);
  if ((await page.evaluate(() => __G.B.phase)) === 'pick') await shoot(page, tag, 'card-pick');
  await page.evaluate(() => __G.autoPick()); await step(page, 30);
  if (await tap(page, 'pause', 40)) { await shoot(page, tag, 'pause'); await tap(page, 'resume', 30); }
  if (await tap(page, 'stats', 40)) { await shoot(page, tag, 'hud-stats'); await tap(page, 'stats-back', 30); }
  await page.evaluate(() => { const B = __G.B; let k = 0; while ((B.phase === 'fight' || B.phase === 'pick') && k++ < 400) { if (B.phase === 'pick') __G.autoPick(); __sim(5); } __sim(0); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(80); });
  await shoot(page, tag, 'result');
  if (await tap(page, 'tab-stats', 40)) { await shoot(page, tag, 'result-stats'); if (await tap(page, 'stat-hero0', 40)) await shoot(page, tag, 'result-hero'); }
  await g.ctx.close();
  const l = await open(br, base, phone, 'noaudio=1&q=low&autostart=1&stage=3&seed=7' + q);
  await l.page.evaluate(() => { const B = __G.B; for (const u of B.heroes) { u.alive = false; u.hp = 0; } __sim(1); for (let i = 0; i < 200 && !__G.lastReward; i++) __step(1); __step(80); });
  await shoot(l.page, tag, 'result-lose'); await l.ctx.close();
}

async function ftue(page, tag) {
  const safe = () => page.evaluate(() => { const r = document.getElementById('frame').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.07]; });
  let last = '', n = 0;
  for (let it = 0; it < 1800 && n < 24; it++) {
    const st = await page.evaluate(() => ({ d: __G.guide.dbg(), screen: __G.screen, phase: __G.B && __G.B.phase, inB: !!__G.B, cleared: __G.meta.acc.cleared, session: __G.meta.acc.ftue.session }));
    const d = st.d;
    if (st.cleared >= 2 && !st.inB && !d.active) break;
    if (d.story && d.story.on) { await step(page, 40); await shoot(page, tag, `ftue-${String(++n).padStart(2, '0')}-story`); await tap(page, 'story-skip', 10); continue; }
    if (d.reveal) { const k = 'reveal:' + JSON.stringify(d.reveal).slice(0, 40); if (k !== last) { last = k; await step(page, 30); await shoot(page, tag, `ftue-${String(++n).padStart(2, '0')}-reveal`); } await tap(page, 'reveal-tap', 6); continue; }
    if (d.active) {
      const key = d.id + ':' + (d.target || 'free');
      if (key !== last) { last = key; await step(page, 24); await shoot(page, tag, `ftue-${String(++n).padStart(2, '0')}-${d.id}`); }
      if (d.noTarget) { const [x, y] = await safe(); await page.mouse.click(x, y); await step(page, 10); if (d.id === 'join') { await step(page, 200); await page.evaluate(() => __sim(0.1)); } continue; }
      if (!d.rect) { if (st.phase === 'fight' && !d.frozen) await page.evaluate(() => __sim(0.2)); await step(page, 8); continue; }
      await tap(page, d.target, 12); continue;
    }
    if (st.screen === 'home' && !st.inB) { await tap(page, 'start', 12); continue; }
    if (st.inB && st.phase === 'fight') { await page.evaluate(() => __sim(0.4)); await step(page, 2); continue; }
    if (st.inB && st.phase === 'pick') { await page.evaluate(() => __G.autoPick()); await step(page, 10); continue; }
    if (st.screen === 'result') { await tap(page, 'home', 20); continue; }
    await step(page, 20);
  }
}

const srv = await serve(); const br = await launch();
try {
  for (const phone of PHONES) {
    { // new account: the guided first session, then every tab as a new player sees it
      const tag = phone + '-new';
      const g = await open(br, srv.base, phone, 'noaudio=1&q=low', { fresh: true }); await step(g.page, 30);
      await shoot(g.page, tag, 'first-frame');
      await ftue(g.page, tag);
      await g.page.evaluate(() => { __G.meta.ftueSkip && __G.meta.ftueSkip(); __G.goto('home'); }); await step(g.page, 30);
      await meta(g.page, tag);
      await g.ctx.close();
    }
    { // fully opened account
      const tag = phone + '-full';
      const g = await open(br, srv.base, phone, 'noaudio=1&q=low'); await step(g.page, 30);
      await fullAccount(g.page); await meta(g.page, tag); await g.ctx.close();
      await battle(br, srv.base, phone, tag, '&preset=vet');
    }
    for (const tag of [phone + '-new', phone + '-full']) {
      const files = (log[tag] || []).map((e) => path.join(OUT, e.file));
      if (files.length) for (let i = 0; i < files.length; i += 8) sheet(files.slice(i, i + 8), path.join(OUT, `sheet-${tag}-${i / 8 + 1}.png`), 2, 780);
    }
  }
} finally { await br.close(); srv.close(); }
fs.writeFileSync(path.join(OUT, 'tour.json'), JSON.stringify(log, null, 1));
console.log(Object.entries(log).map(([k, v]) => `${k}: ${v.length} shots`).join('\n'));
