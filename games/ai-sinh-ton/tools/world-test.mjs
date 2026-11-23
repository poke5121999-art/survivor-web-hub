// The world map of the Ra Trận tab through real taps and drags, on a fresh account, one in chapter 3 and one with every
// region open: each open region opens its own chapter with the right stage selected, a closed one stays shut, a sideways
// drag pans the map, tap areas are at least 48 CSS px, chapter lines name ten chapters before Vô Tận, no screen shows the
// word "tướng", and the screen's draw calls. Shots go to .chk/a10/world/.
// Usage: timeout 900 node games/ai-sinh-ton/tools/world-test.mjs [--quick]
import path from 'node:path';
import fs from 'node:fs';
import { serve, launch, open, checker, sheet, ROOT } from './pw.mjs';
import { screenCalls } from './world-dc.mjs';

const OUT = path.join(ROOT, '.chk', 'a10', 'world'); fs.mkdirSync(OUT, { recursive: true });
const QUICK = process.argv.includes('--quick');
// the UI pass (what ui-shots and the kit count) against the brief's 150; with every viewport on the screen drawn once
// on top (map, four team portraits) the old screen was 267..285
const DC_MAX = 150, DC_ALL = 190;
const { check, done } = checker();
const srv = await serve(); const br = await launch();
const shots = [];

const step = (page, n) => page.evaluate((k) => __step(k), n);
const targets = (page) => page.evaluate(() => __ui.targets());
const tapXY = async (page, x, y) => { if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
async function tap(page, id) {
  const t = (await targets(page)).find((q) => q.id === id); if (!t) return false;
  await tapXY(page, t.vx + t.vw / 2, t.vy + t.vh / 2); await step(page, 12); return true;
}
const home = (page) => page.evaluate(() => ({ view: __G.metaUi.view(), sel: __G.metaUi.stage(), line: __G.metaUi.chapterLine, story: __G.metaUi.story, pips: __G.metaUi.pips, world: __world.dbg(), state: __world.state, toast: (__ui.scene.children.find((c) => c.position.z === 1000) || { children: [] }).children.length }));
async function shot(page, name) { await step(page, 3); const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); shots.push(f); return f; }
async function account(page, cleared) {
  await page.evaluate((c) => {
    const M = __G.meta, A = M.acc; M.ftueSkip(); for (const id of ['spectate', 'speed', 'daily', 'chapter', 'equip', 'merge']) M.ftueDone(id);
    A.cleared = c; A.level = Math.max(A.level, Math.min(40, 1 + c)); M.save(); for (const id of M.pendingReveals()) M.markSeen(id); __G.goto('heroes'); __G.goto('home');
  }, cleared);
  await step(page, 40);
}
// every text on screen, read from the kit's text nodes
const shownTexts = (page) => page.evaluate(() => { const out = []; const vis = (n) => { for (let a = n; a; a = a.parent) if (!a.visible) return false; return true; }; __ui.scene.traverse((o) => { if (typeof o.str === 'string' && vis(o)) out.push(o.str); }); return out; });

try {
  const phones = QUICK ? ['s22'] : ['s22', 'xiaomi', 'desktop'];
  for (const phone of phones) {
    const { ctx, page, problems } = await open(br, srv.base, phone, '', { freeze: true });
    const frameK = await page.evaluate(() => document.getElementById('frame').getBoundingClientRect().width / 780);

    // ---- fresh account: one region open ----
    await account(page, 0);
    let h = await home(page);
    check(h.view === 'world' && h.sel === 1, `${phone} fresh: Ra Trận opens on the world map with stage 1 selected (${h.view}, ${h.sel})`);
    check(h.world.filter((r) => r.open).length === 1 && h.world[0].current && h.world.length === 10, `${phone} fresh: 10 regions, only Rừng Cổ open and current (${h.world.map((r) => (r.open ? 'O' : '-')).join('')})`);
    const dcFresh = await screenCalls(page);
    await shot(page, `${phone}-fresh-world`);
    for (const k of [1, 2]) {
      await page.evaluate((kk) => __world.focus(kk, true), k); await step(page, 4);
      const tapped = await tap(page, 'region-' + k); h = await home(page);
      check(tapped && h.view === 'world' && h.sel === 1 && h.toast > 0, `${phone} fresh: closed region ${k} does not open (${tapped}, view ${h.view}, sel ${h.sel}, toast ${h.toast})`);
    }
    await page.evaluate(() => __world.focus(0, true)); await step(page, 4);
    check(await tap(page, 'region-0'), `${phone} fresh: region-0 is a live target`);
    h = await home(page);
    check(h.view === 'chapter' && h.sel === 1 && /chương 1/i.test(h.line) && h.story.length > 10, `${phone} fresh: Rừng Cổ opens chapter 1 at stage 1 with its story ("${h.line}", "${h.story}")`);
    await shot(page, `${phone}-fresh-chapter`);
    check(await tap(page, 'view-world') && (await home(page)).view === 'world', `${phone} fresh: BẢN ĐỒ goes back to the map`);

    // ---- chapter 3 account: stage 13 to play ----
    await account(page, 12);
    h = await home(page);
    check(h.view === 'world' && h.sel === 13 && h.world.filter((r) => r.open).length === 3 && h.world[2].current && h.world[2].sel, `${phone} ch3: map on, stage 13 selected, three regions open, Sa Mạc Mộ current (${h.sel}, ${h.world.filter((r) => r.open).length})`);
    for (let k = 0; k < 10; k++) {
      await page.evaluate((kk) => __world.focus(kk, true), k); await step(page, 4);
      const ok = await tap(page, 'region-' + k); h = await home(page);
      if (k < 3) {
        const want = k === 2 ? 13 : k * 5 + 1;
        check(ok && h.view === 'chapter' && h.sel === want && h.pips.map((p) => p.n).join() === [1, 2, 3, 4, 5].map((i) => k * 5 + i).join() && new RegExp('chương ' + (k + 1) + '\\b', 'i').test(h.line),
          `${phone} ch3: region ${k} opens chapter ${k + 1} at stage ${h.sel} (want ${want}), "${h.line}"`);
        if (k === 2) check(h.pips.map((p) => p.state).join() === 'cleared,cleared,current,locked,locked' && h.pips[2].sel, `${phone} ch3: pips ${h.pips.map((p) => p.state).join()}`);
        await tap(page, 'view-world');
      } else check(ok && h.view === 'world', `${phone} ch3: closed region ${k} stays shut (view ${h.view})`);
    }
    // a stage pip in chapter 3, a locked one, then the arrows
    await page.evaluate(() => __world.focus(2, true)); await step(page, 4); await tap(page, 'region-2');
    await tap(page, 'stage-pip-0'); h = await home(page); check(h.sel === 11, `${phone} ch3: pip 1 selects stage 11 (${h.sel})`);
    await tap(page, 'stage-pip-4'); h = await home(page); check(h.sel === 11 && h.toast > 0, `${phone} ch3: locked boss pip keeps stage 11 (${h.sel})`);
    await tap(page, 'stage-next'); h = await home(page); check(h.sel === 12, `${phone} ch3: stage-next walks to 12 (${h.sel})`);
    if (phone === 's22') await shot(page, `${phone}-ch3-chapter`);
    await tap(page, 'view-world');
    // a sideways drag pans the map
    const before = (await home(page)).state.scroll;
    const sc = await page.evaluate(() => { const r = __world.scroll; const b = document.getElementById('frame').getBoundingClientRect(), k = b.width / 780; r.updateWorldMatrix(true, false); const p = r.getWorldPosition(new __ui.THREE.Vector3()); return { x: b.left + (p.x + r.w / 2) * k, y: b.top + (-p.y + r.h / 2) * k }; });
    await page.mouse.move(sc.x + 80, sc.y); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(sc.x + 80 - i * 20, sc.y); await step(page, 1); } await page.mouse.up(); await step(page, 30);
    const after = (await home(page)).state.scroll;
    check(after - before > 100, `${phone}: dragging 160 px left pans the map by ${(after - before).toFixed(0)} design px`);
    h = await home(page); check(h.view === 'world', `${phone}: a drag over a region does not open it (view ${h.view})`);

    // ---- every region open ----
    await account(page, 50);
    h = await home(page);
    check(h.world.every((r) => r.open) && h.world[9].current && h.view === 'world', `${phone} all open: 10 regions open, Rìa Hư Không current (${h.world.map((r) => (r.open ? 'O' : '-')).join('')})`);
    const dcFull = await screenCalls(page);
    await shot(page, `${phone}-full-world`);
    for (let k = 0; k < 10; k++) {
      await page.evaluate((kk) => __world.focus(kk, true), k); await step(page, 4);
      if (phone === 's22' && [1, 4, 7, 8, 9].includes(k)) await shot(page, `${phone}-full-world-${k}`);
      const ok = await tap(page, 'region-' + k); h = await home(page);
      const want = k === 9 ? 51 : k * 5 + 1;
      check(ok && h.view === 'chapter' && h.sel === want && (k === 9 ? /vô tận/i.test(h.line) : new RegExp('chương ' + (k + 1) + ': ' + h.world[k].name, 'i').test(h.line)), `${phone} all open: region ${k} (${h.world[k].name}) opens at stage ${h.sel}, "${h.line}"`);
      if (k === 7 || (k === 9 && phone === 's22')) await shot(page, `${phone}-full-chapter-${k + 1}`);
      await tap(page, 'view-world');
    }
    for (const n of [26, 31, 50, 51]) {
      await page.evaluate((s) => { __ui.tapId('region-' + Math.min(9, Math.floor((s - 1) / 5))); }, n); await step(page, 4);
      const l = await page.evaluate((s) => { let i = 0; while (__G.metaUi.stage() !== s && i++ < 80) __ui.tapId(__G.metaUi.stage() < s ? 'stage-next' : 'stage-prev'); return __G.metaUi.chapterLine; }, n);
      check(n <= 50 ? new RegExp('chương ' + Math.ceil(n / 5) + ':', 'i').test(l) : /vô tận/i.test(l), `${phone}: stage ${n} reads "${l}"`);
      await page.evaluate(() => __ui.tapId('view-world')); await step(page, 4);
    }

    // tap areas on the map are big enough and hit themselves
    const bad = await page.evaluate(() => { const out = []; for (const t of __ui.targets()) { if (!/^region-|^stage-pip-|^view-/.test(t.id)) continue; const k = document.getElementById('frame').getBoundingClientRect().width / 780; if (t.w < 48 * Math.min(1, k) - 0.5 || t.h < 48 * Math.min(1, k) - 0.5) out.push(t.id + ' ' + t.w.toFixed(0) + 'x' + t.h.toFixed(0)); const hit = __ui.hitAt(t.x + t.w / 2, t.y + t.h / 2); if (hit !== t.id) out.push(t.id + ' centre hits ' + hit); } return out; });
    check(!bad.length, `${phone}: map tap areas at least 48 CSS px and hit themselves` + (bad.length ? ' ' + bad.join('; ') : ''));
    check(frameK > 0, `${phone}: frame scale ${frameK.toFixed(2)}`);

    // no "tướng" on any screen of the opened account
    const seen = [];
    for (const s of ['home', 'heroes', 'gacha', 'equip', 'rewards']) { await page.evaluate((n) => __G.goto(n), s); await step(page, 20); for (const x of await shownTexts(page)) if (/tướng/i.test(x)) seen.push(s + ': ' + x); }
    check(!seen.length, `${phone}: no shown text says "tướng"` + (seen.length ? ' ' + seen.slice(0, 5).join(' | ') : ''));

    console.log(`draw calls ${phone}: fresh ${JSON.stringify(dcFresh)} full ${JSON.stringify(dcFull)}`);
    check(dcFresh.ui <= DC_MAX && dcFull.ui <= DC_MAX && dcFresh.total <= DC_ALL && dcFull.total <= DC_ALL, `${phone}: Ra Trận world map UI pass at most ${DC_MAX} (fresh ${dcFresh.ui}, all open ${dcFull.ui}), with its viewports at most ${DC_ALL} (fresh ${dcFresh.total}, all open ${dcFull.total})`);
    check(problems.length === 0, `${phone}: no page problems` + (problems.length ? ' ' + problems.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  sheet(shots.filter((f) => /world\.png|chapter/.test(f)), path.join(OUT, 'sheet.png'), 3, 520);
} finally { await br.close(); srv.close(); }
done();
