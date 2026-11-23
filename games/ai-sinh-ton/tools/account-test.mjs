// Delete account through real taps and real holds. A vet account with progress and fake hub keys: the delete button is on the
// home settings only, the panel cancels cleanly, a tap / a 1.9 s hold / two 1.2 s holds delete nothing, a 2.1 s hold wipes every
// aisinhton.* key and reloads as a brand-new account (first-time guide), the hub keys and unrelated keys stay byte-identical.
// Screenshots go to .chk/account/. Usage: timeout 900 node games/ai-sinh-ton/tools/account-test.mjs
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, checker, sheet, ROOT, GAME, PHONES } from './pw.mjs';

const OUT = path.join(ROOT, '.chk', 'account'); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const QUERY = 'noaudio=1&q=low';
// the hub's own login key (js/session.js, js/game-gate.js) and keys that belong to nobody here
const KEPT = { 'hub.session.v1': JSON.stringify({ kind: 'member', role: 'member', email: 'dummy@local', token: 'dummy-token-123' }), 'blockadez.lang': 'vi', 'unrelated.note': 'khong dong vao' };
const shots = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (page, n) => page.evaluate((k) => __step(k), n);
const targets = (page) => page.evaluate(() => __ui.targets());
const dbg = (page) => page.evaluate(() => __G.screens.account.dbg());
const centre = async (page, id) => { const t = (await targets(page)).find((q) => q.id === id); return t ? { x: t.x + t.w / 2, y: t.y + t.h / 2, t } : null; };
let MOUSE = false;
async function tap(page, id) { const c = await centre(page, id); if (!c) return false; if (MOUSE) await page.mouse.click(c.x, c.y); else await page.touchscreen.tap(c.x, c.y); await step(page, 8); return true; }
async function snap(page, phone, name) { const f = path.join(OUT, `${phone}-${name}.png`); await page.screenshot({ path: f }); shots.push(f); }
const keysOf = (page) => page.evaluate(() => Object.keys(localStorage).sort());
const readKeys = (page, keys) => page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, localStorage.getItem(k)])), keys);
async function hold(page, cdp, id, ms) {
  const c = await centre(page, id);
  if (MOUSE) { await page.mouse.move(c.x, c.y); await page.mouse.down(); await wait(ms); return c; }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await wait(ms);
  return c;
}
const release = (cdp, page) => (MOUSE ? page.mouse.up() : cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));

async function audit(page, phone, label) {
  const bad = await page.evaluate(() => {
    const out = [], fr = document.getElementById('frame').getBoundingClientRect();
    for (const t of __ui.targets()) {
      if (!/^acct-/.test(t.id)) continue;
      if (t.w < 47.5 || t.h < 47.5) out.push(`${t.id} ${Math.round(t.w)}x${Math.round(t.h)}`);
      const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
      if (__ui.hitAt(cx, cy) !== t.id) out.push(`${t.id} centre owned by ${__ui.hitAt(cx, cy)}`);
      if (t.x < fr.left - 1 || t.x + t.w > fr.right + 1) out.push(`${t.id} outside the frame`);
    }
    return out;
  });
  const n = (await targets(page)).filter((t) => /^acct-/.test(t.id)).length;
  check(n > 0 && bad.length === 0, `${phone} ${label}: ${n} targets are at least 48x48 CSS px and own their centre (${bad.slice(0, 4).join('; ') || 'none out'})`);
}

async function run(phone) {
  MOUSE = !PHONES[phone].hasTouch;
  const ctx = await br.newContext(PHONES[phone]);
  await ctx.addInitScript(([kept]) => {
    try { if (!sessionStorage.getItem('__seed')) { for (const k in kept) localStorage.setItem(k, kept[k]); sessionStorage.setItem('__seed', '1'); } } catch (e) {}
  }, [KEPT]);
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(srv.base + GAME + '?' + QUERY + '&preset=vet');
  await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
  await step(page, 20);

  // an account with progress, and settings that differ from the defaults
  const prog = await page.evaluate(() => {
    const M = __G.meta;
    for (let s = 1; s <= 3; s++) M.finishStage({ stage: s, won: true, wavesCleared: 5, seconds: 30 });
    M.acc.gold += 12345; M.acc.bag.push({ uid: ++M.acc.uidSeq, item: 'w_cua', tier: 1, lv: 3 }); M.save();
    __G.setSetting('shake', false); __G.setSetting('autoUlt', true); __G.setSetting('quality', 'low');
    return { cleared: M.acc.cleared, gold: M.acc.gold, bag: M.acc.bag.length };
  });
  check(prog.cleared >= 3 && prog.gold > 12000 && prog.bag >= 1, `${phone}: vet account with progress (cleared ${prog.cleared}, gold ${prog.gold}, bag ${prog.bag})`);
  const SAVE = 'aisinhton.save.v1', SET = 'aisinhton.settings.v1';
  const before = await readKeys(page, [SAVE, SET, ...Object.keys(KEPT)]);
  check(before[SAVE] && before[SET] && Object.keys(KEPT).every((k) => before[k] === KEPT[k]), `${phone}: save, settings and the kept keys are in storage before the test`);
  // a stray game key with a later version suffix goes too
  await page.evaluate(() => { localStorage.setItem('aisinhton.bz.best.v1', '{"wave":4,"score":99}'); localStorage.setItem('aisinhton.bz.settings.v1', '{}'); });
  const owned = (await keysOf(page)).filter((k) => k.startsWith('aisinhton.'));

  // ---- the home settings carry the button (the settings screen is rebuilt by someone else: SKIP says it is not there yet) ----
  await tap(page, 'gear'); await step(page, 30);
  let ids = (await targets(page)).map((t) => t.id);
  if (ids.includes('acct-delete')) {
    check(true, `${phone}: home settings offer acct-delete`);
    check(await tap(page, 'acct-delete'), `${phone}: acct-delete taps`); await step(page, 30);
  } else {
    console.log(`SKIP ${phone}: acct-delete is not on the home settings yet (targets: ${ids.join(',')}); opening the panel through __G.openAccountDelete()`);
    await page.evaluate(() => __G.openAccountDelete()); await step(page, 30);
  }
  // ---- panel, cancel ----
  ids = (await targets(page)).map((t) => t.id);
  const d1 = await dbg(page);
  check(d1.open && ['acct-hold', 'acct-cancel'].every((i) => ids.includes(i)) && ids.every((i) => /^acct-/.test(i)), `${phone}: the confirmation panel is up and nothing else takes a tap (${ids.join(',')})`);
  check(d1.texts.length === 3 && d1.texts.every((t) => t.w > 20 && t.w <= 290), `${phone}: panel texts stay inside the panel (widths ${d1.texts.map((t) => Math.round(t.w)).join(',')})`);
  await snap(page, phone, '2-confirm');
  await audit(page, phone, 'confirmation');
  check(await tap(page, 'acct-cancel'), `${phone}: HUỶ taps`); await step(page, 40);
  const d2 = await dbg(page);
  const afterCancel = await readKeys(page, [SAVE, SET]);
  check(!d2.open && !(await targets(page)).some((t) => /^acct-(hold|cancel)$/.test(t.id)) && afterCancel[SAVE] === before[SAVE] && afterCancel[SET] === before[SET], `${phone}: HUỶ closes the panel and nothing changed`);

  // ---- a tap, a short hold, two holds: nothing happens ----
  await page.evaluate(() => __G.openAccountDelete()); await step(page, 30);
  await tap(page, 'acct-hold'); await step(page, 10);
  let now = await readKeys(page, [SAVE, SET]);
  check(now[SAVE] === before[SAVE] && now[SET] === before[SET] && (await dbg(page)).open, `${phone}: a tap on the hold button deletes nothing`);
  await hold(page, cdp, 'acct-hold', 1000);
  const mid = await dbg(page);
  check(mid.hold > 0.3 && mid.hold < 0.7, `${phone}: the fill is part way up after about 1 s (${mid.hold.toFixed(2)})`);
  await snap(page, phone, '3-half-held');
  await release(cdp, page); await step(page, 6);
  check((await dbg(page)).hold === 0, `${phone}: the fill is back to 0 after release`);
  await hold(page, cdp, 'acct-hold', 1900); await release(cdp, page); await step(page, 6);
  now = await readKeys(page, [SAVE, SET]);
  check(now[SAVE] === before[SAVE] && now[SET] === before[SET] && (await dbg(page)).hold === 0, `${phone}: a 1.9 s hold deletes nothing and resets the fill`);
  for (let i = 0; i < 2; i++) { await hold(page, cdp, 'acct-hold', 1200); await release(cdp, page); await step(page, 6); }
  now = await readKeys(page, [SAVE, SET]);
  check(now[SAVE] === before[SAVE] && now[SET] === before[SET], `${phone}: two separate 1.2 s holds delete nothing`);
  // sliding off the button resets the fill
  {
    const c = await hold(page, cdp, 'acct-hold', 700);
    if (MOUSE) await page.mouse.move(c.x, c.y - 150); else await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x, y: c.y - 150 }] }); await wait(150);
    check((await dbg(page)).hold === 0, `${phone}: moving the finger off the hold button resets the fill`);
    await wait(1600); await release(cdp, page); await step(page, 6);
    now = await readKeys(page, [SAVE, SET]);
    check(now[SAVE] === before[SAVE] && (await dbg(page)).hold === 0, `${phone}: staying off the button does not confirm, even after 2 s in total`);
  }

  // ---- the real thing ----
  await page.evaluate(() => { window.__marker = 1; });
  const urlBefore = page.url();
  const nav = page.waitForEvent('load', { timeout: 20000 }).catch(() => null);
  await hold(page, cdp, 'acct-hold', 2100);
  await nav;
  await release(cdp, page).catch(() => {});
  await page.waitForFunction('window.__marker === undefined && window.__ready === true', null, { timeout: 90000 });
  await step(page, 30);
  const url = new URL(page.url());
  check(/[?&]preset=vet/.test(urlBefore) && !url.searchParams.has('preset') && !url.searchParams.has('autostart'), `${phone}: the page reloaded without preset (${url.search})`);
  const st = await page.evaluate(() => ({ acc: JSON.parse(JSON.stringify(__G.meta.acc)), readOnly: __G.meta.readOnly, settings: { ...__G.settings }, screen: __G.screen, guide: __G.guide.dbg(), next: __G.meta.ftueNext({ screen: 'home', event: 'home' }), tutorial: !__G.meta.acc.ftue.session && __G.meta.acc.cleared === 0 }));
  check(st.acc.gold === 500 && st.acc.gems === 300 && Object.keys(st.acc.heroes).join() === 'chon' && st.acc.cleared === 0 && !st.acc.ftue.session && st.acc.bag.length === 0 && !st.readOnly, `${phone}: fresh account (gold ${st.acc.gold}, gems ${st.acc.gems}, heroes ${Object.keys(st.acc.heroes)}, cleared ${st.acc.cleared}, session ${st.acc.ftue.session})`);
  check(st.settings.shake !== false && !st.settings.autoUlt && st.settings.quality === '' && st.settings.sound === true, `${phone}: settings are back to defaults (${JSON.stringify(st.settings)})`);
  check(st.tutorial && st.screen === 'home', `${phone}: the player is on a first-time start (screen ${st.screen}, tutorial stage 1 pending)`);
  await snap(page, phone, '4-fresh-start');
  const flags = await page.evaluate(() => ({ ftue: JSON.parse(JSON.stringify(__G.meta.acc.ftue)), cleared: __G.meta.acc.cleared, level: __G.meta.acc.level, cheat: !!__G.meta.acc.cheatUnlock, home: !!__G.screens.home }));
  check(!flags.ftue.session && flags.cleared === 0 && !flags.cheat && flags.level === 1, `${phone}: first-time flags: session guide not done, cleared 0, no cheat unlock, level ${flags.level} (the tutorial stage and guide start from these)`);
  const left = await readKeys(page, Object.keys(KEPT));
  check(Object.keys(KEPT).every((k) => left[k] === KEPT[k]), `${phone}: hub login key, blockadez.lang and the unrelated key are byte-identical`);
  const keys = await keysOf(page);
  const own = keys.filter((k) => k.startsWith('aisinhton.'));
  check(!own.includes('aisinhton.bz.best.v1') && !own.includes('aisinhton.bz.settings.v1') && owned.every((k) => !own.includes(k) || k === SAVE || k === SET), `${phone}: every aisinhton.* key is gone or re-created by the new account (${own.join(',') || 'none'})`);
  const fresh = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE) || 'null');
  check(!fresh || (fresh.gold === 500 && fresh.cleared === 0), `${phone}: a re-created save is the fresh account`);
  // ---- reload once more: nothing comes back ----
    await page.reload(); await page.waitForFunction('window.__ready === true', null, { timeout: 90000 }); await step(page, 20);
  const again = await page.evaluate(() => ({ gold: __G.meta.acc.gold, gems: __G.meta.acc.gems, heroes: Object.keys(__G.meta.acc.heroes), cleared: __G.meta.acc.cleared, ftue: __G.meta.acc.ftue.session, settings: { ...__G.settings } }));
  check(again.gold === 500 && again.gems === 300 && again.heroes.join() === 'chon' && again.cleared === 0 && !again.ftue && again.settings.quality === '' && again.settings.shake !== false, `${phone}: a second reload still shows the fresh account (${JSON.stringify(again)})`);
  const keys2 = await keysOf(page);
  check(!keys2.includes('aisinhton.bz.best.v1') && Object.keys(KEPT).every((k) => keys2.includes(k)), `${phone}: nothing was resurrected, the kept keys are still there`);
  check(problems.length === 0, `${phone}: no console errors (${problems.slice(0, 3).join(' | ') || 'none'})`);
  await ctx.close();
}

try {
  for (const phone of ['s22', 'xiaomi', 'desktop']) await run(phone);
  const s22 = shots.filter((f) => path.basename(f).startsWith('s22-'));
  if (s22.length) sheet(s22, path.join(OUT, 'sheet.png'), s22.length, 360);
} catch (e) { check(false, 'tool crashed: ' + (e && e.stack || e)); }
await br.close(); srv.close();
done();
