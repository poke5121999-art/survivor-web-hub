/*
 * w5quest (WORLD-GAPS.md §6 W5): lệnh Yarn của chuỗi nhiệm vụ vùng.
 *   - MakeBait (DredgeDialogueRunner.cs:599): 3 cá trong BAIT_INPUT → 3 "bait" ở BAIT_OUTPUT, lưới vào trống. GetDidAddEnoughFishToMakeBait (:855).
 *   - TryConvertDogTags (:865): 2 quest-dog-tag → 2 research-item, dog-tags-returned 2; không còn thẻ thì trả false.
 *   - ActivateBanishMachine (BanishMachine.cs:33): banish-machine-expiry = time + 0,5; phát 'banishMachine' bật, quá hạn thì tắt; tải sổ trong hạn bật lại.
 *   - ToggleDSAltarFlame, GetNumDamagedDeployables (ItemManager.cs:497).
 *   - Chạy node Yarn thật (Soldier_RegularBait, Soldier_DogTagHandIn, ResearchPontoon_MachineActivated): lưới kéo-thả mở bằng DRCargo.
 * Chạy: node test/dredge-w5quest.js    Ảnh: SHOTS (mặc định %TEMP%/dredge-w5quest)
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-w5quest');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL  ' + m); } };
const ev = (page, f, a) => page.evaluate(f, a);

(async () => {
  const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
  await sleep(200);
  const base = (process.env.DR_URL ? process.env.DR_URL.replace(/[/]$/, '') : 'http://localhost:' + srv.address().port);
  const br = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  await sleep(500);

  // 0. dữ liệu đo từ Game.unity và tiếng máy
  const qo = await ev(page, () => ({ bm: DR_QUESTOBJ.banishMachine, fl: DR_QUESTOBJ.altarFlames, api: !!window.DRQuestObj, aud: !!DR_AUDIO['ambience.banishMachine'] }));
  ok(qo.bm && Math.hypot(qo.bm.p[0] + 331, qo.bm.p[2] - 413) < 10 && qo.bm.durationDays === 0.5 && qo.bm.toggles.length === 2, 'banishMachine data: ' + JSON.stringify(qo.bm));
  ok(qo.bm.audio.min === 50 && qo.bm.audio.max === 300 && qo.bm.audio.fadeTime === 2, 'banish audio data: ' + JSON.stringify(qo.bm.audio));
  ok(qo.fl.length === 1 && Math.hypot(qo.fl[0].p[0] - 432, qo.fl[0].p[2] + 459) < 40 && qo.fl[0].particles === 5, 'altar flame data: ' + JSON.stringify(qo.fl));
  ok(qo.api && qo.aud, 'DRQuestObj / audio key missing');
  const mp3 = await page.request.get(base + '/games/dredge/audio/ambience/Banish_Machine.mp3');
  ok(mp3.status() === 200 && (await mp3.body()).length > 50000, 'Banish_Machine.mp3 not served');
  ok(await ev(page, () => !DRYarn.stubs().some(k => ['MakeBait', 'ActivateBanishMachine', 'ToggleDSAltarFlame'].includes(k))), 'W5 commands still stubs');

  // 1. MakeBait
  const bait = await ev(page, () => {
    const fish = Object.values(DR_ITEMS).find(i => i.subtype === 'FISH' && i.dims.length === 1 && i.id !== 'bait');
    const empty = DRYarn.functions.GetDidAddEnoughFishToMakeBait();      // lưới chưa có
    DR.s.grids.BAIT_INPUT = { cfg: 'BaitInput', items: [], damage: [], extra: [] };
    const g = DR.grid('BAIT_INPUT');
    const none = DRYarn.functions.GetDidAddEnoughFishToMakeBait();
    for (let i = 0; i < 3; i++) DRGrid.autoPlace(g, fish);
    const placed = g.items.length, enough = DRYarn.functions.GetDidAddEnoughFishToMakeBait();
    DRYarn.commands.MakeBait.f([]);
    const o = DR.grid('BAIT_OUTPUT');
    return { fish: fish.id, empty, none, placed, enough, after: DRYarn.functions.GetDidAddEnoughFishToMakeBait(), inLeft: g.items.length,
      out: o.items.map(i => i.id), saved: DR.s.grids.BAIT_OUTPUT.items.length };
  });
  ok(!bait.empty && !bait.none && bait.placed === 3 && bait.enough, 'GetDidAddEnoughFish: ' + JSON.stringify(bait));
  ok(!bait.after && bait.inLeft === 0 && bait.out.length === 3 && bait.out.every(i => i === 'bait') && bait.saved === 3, 'MakeBait result: ' + JSON.stringify(bait));

  // 2. TryConvertDogTags
  const dog = await ev(page, () => {
    DR.s.grids.SOLDIER_DOG_TAG_INPUT = { cfg: 'DogTagInput', items: [], damage: [], extra: [] };
    const g = DR.grid('SOLDIER_DOG_TAG_INPUT');
    for (let i = 0; i < 2; i++) DRGrid.autoPlace(g, DR.item('quest-dog-tag'));
    const r1 = DRYarn.functions.TryConvertDogTags();
    const o = DR.grid('SOLDIER_DOG_TAG_OUTPUT');
    const r2 = DRYarn.functions.TryConvertDogTags();
    return { r1, r2, inLeft: g.items.length, out: o.items.map(i => i.id), ret: DR.s.vars['dog-tags-returned'] };
  });
  ok(dog.r1 === true && dog.r2 === false && dog.inLeft === 0 && dog.out.length === 2 && dog.out.every(i => i === 'research-item') && dog.ret === 2, 'TryConvertDogTags: ' + JSON.stringify(dog));
  const cap = await ev(page, () => {   // lưới ra giới hạn theo cỡ (25 ô); dog-tags-returned đếm đủ số thẻ
    DR.s.grids.SOLDIER_DOG_TAG_OUTPUT.items.length = 0;
    const g = DR.grid('SOLDIER_DOG_TAG_INPUT');
    const tag = DR.item('quest-dog-tag');
    for (let i = 0; i < 13; i++) DRGrid.autoPlace(g, tag);
    const n = g.items.length;
    DRYarn.functions.TryConvertDogTags();
    return { n, out: DR.grid('SOLDIER_DOG_TAG_OUTPUT').items.length, ret: DR.s.vars['dog-tags-returned'] };
  });
  ok(cap.out === Math.min(cap.n, 25) && cap.ret === 2 + cap.n, 'dog tag output cap: ' + JSON.stringify(cap));

  // 3. GetNumDamagedDeployables
  const dd = await ev(page, () => {
    const g = DR.grid('INVENTORY'), pot = DR.item('pot1');
    const before = DRYarn.functions.GetNumDamagedDeployables();
    const inst = DRGrid.autoPlace(g, pot);
    const full = DRYarn.functions.GetNumDamagedDeployables();
    if (inst) inst.dur = +pot.maxDurabilityDays - 1;
    return { before, placed: !!inst, full, worn: DRYarn.functions.GetNumDamagedDeployables() };
  });
  ok(dd.before === 0 && dd.placed && dd.full === 0 && dd.worn === 1, 'GetNumDamagedDeployables: ' + JSON.stringify(dd));

  // 4. ActivateBanishMachine
  const bm = await ev(page, () => {
    window.__bm = []; DR.on('banishMachine', on => window.__bm.push(on));
    const t = DR.s.time;
    DRYarn.commands.ActivateBanishMachine.f([]);
    return { t, exp: DR.s.vars['banish-machine-expiry'], active: DRQuestObj.banishActive(), ev: window.__bm.slice() };
  });
  ok(Math.abs(bm.exp - (bm.t + 0.5)) < 1e-6 && bm.active && bm.ev.join() === 'true', 'ActivateBanishMachine: ' + JSON.stringify(bm));
  await ev(page, () => { DR.s.time = DR.s.vars['banish-machine-expiry'] + 0.01; });
  await page.waitForFunction(() => window.__bm.length === 2, null, { timeout: 5000 }).catch(() => {});
  const off = await ev(page, () => ({ ev: window.__bm.slice(), active: DRQuestObj.banishActive() }));
  ok(off.ev.join() === 'true,false' && !off.active, 'machine not switched off after expiry: ' + JSON.stringify(off));
  // tải sổ trong hạn → bật lại (BanishMachine.Start)
  const re = await ev(page, () => { DR.s.vars['banish-machine-expiry'] = DR.s.time + 0.2; DR.emit('load'); return { active: DRQuestObj.banishActive(), ev: window.__bm.slice() }; });
  ok(re.active && re.ev.join() === 'true,false,true', 'machine not restored from a save in range: ' + JSON.stringify(re));
  await ev(page, () => { DR.s.vars['banish-machine-expiry'] = 0; DR.emit('load'); });
  ok(!(await ev(page, () => DRQuestObj.banishActive())), 'machine active with an old expiry');

  // 5. ToggleDSAltarFlame
  const af = await ev(page, () => {
    const seen = []; DR.on('altarFlame', b => seen.push(b));
    DRYarn.commands.ToggleDSAltarFlame.f(['true']); const a = DRQuestObj.altarFlame;
    DRYarn.commands.ToggleDSAltarFlame.f(['false']);
    return { a, b: DRQuestObj.altarFlame, seen };
  });
  ok(af.a === true && af.b === false && af.seen.join() === 'true,false', 'ToggleDSAltarFlame: ' + JSON.stringify(af));

  // 6. node Yarn thật. Lưới kéo-thả mở bằng DRCargo; đóng lưới = chạy tiếp node.
  await ev(page, () => {
    ['BAIT_INPUT', 'BAIT_OUTPUT', 'SOLDIER_DOG_TAG_INPUT', 'SOLDIER_DOG_TAG_OUTPUT'].forEach(k => delete DR.s.grids[k]);
    DR.s.vars['dog-tags-returned'] = 0;
    window.__run = node => { window.__ended = false; DRYarn.run(node, { line: (l, next) => setTimeout(next, 30), options: (o, ch) => ch(0), end() { window.__ended = true; } }); };
  });
  for (const [vw, vh] of [[1280, 720], [844, 390]]) {
    await page.setViewportSize({ width: vw, height: vh });
    await ev(page, () => { DR.s.grids.BAIT_INPUT = { cfg: 'BaitInput', items: [], damage: [], extra: [] }; DR.s.grids.BAIT_OUTPUT = { cfg: 'BaitOutput', items: [], damage: [], extra: [] }; window.__run('Soldier_RegularBait'); });
    await page.waitForFunction(() => DRCargo.isOpen() && DRCargo._debug().leftKind === 'quest', null, { timeout: 10000 }).catch(() => {});
    const o1 = await ev(page, () => DRCargo.isOpen() && DRCargo._debug());
    ok(o1 && o1.leftKind === 'quest' && o1.tabs.includes('STORAGE'), 'BaitInput grid not opened in DRCargo: ' + JSON.stringify(o1));
    await ev(page, () => { const fish = Object.values(DR_ITEMS).find(i => i.subtype === 'FISH' && i.dims.length === 1); const g = DR.grid('BAIT_INPUT'); for (let i = 0; i < 2; i++) DRGrid.autoPlace(g, fish); DRCargo.refresh(); });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, 'w5-baitinput-' + vw + '.png') });
    await ev(page, () => DRCargo.close());
    await page.waitForFunction(() => DRCargo.isOpen() && DRCargo._debug().leftKind === 'quest' && DR.grid('BAIT_OUTPUT').items.length > 0, null, { timeout: 10000 }).catch(() => {});
    const o2 = await ev(page, () => ({ open: DRCargo.isOpen(), out: DR.grid('BAIT_OUTPUT').items.map(i => i.id), inp: DR.grid('BAIT_INPUT').items.length }));
    ok(o2.open && o2.out.join() === 'bait,bait' && o2.inp === 0, 'Soldier_RegularBait did not convert 2 fish into 2 bait: ' + JSON.stringify(o2));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'w5-baitoutput-' + vw + '.png') });
    await ev(page, () => DRCargo.close());
    await page.waitForFunction(() => window.__ended, null, { timeout: 10000 }).catch(() => {});
    ok(await ev(page, () => window.__ended && DRYarn.visited('Soldier_RegularBaitComplete')), 'Soldier_RegularBait did not finish / mark complete');
    await ev(page, () => { DR.s.grids.BAIT_OUTPUT.items.length = 0; });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  // dog tags
  await ev(page, () => { DR.s.grids.SOLDIER_DOG_TAG_INPUT = { cfg: 'DogTagInput', items: [], damage: [], extra: [] }; delete DR.s.grids.SOLDIER_DOG_TAG_OUTPUT; DR.s.vars['dog-tags-returned'] = 0; window.__run('Soldier_DogTagHandIn'); });
  await page.waitForFunction(() => DRCargo.isOpen() && DRCargo._debug().leftKind === 'quest', null, { timeout: 10000 }).catch(() => {});
  await ev(page, () => { const g = DR.grid('SOLDIER_DOG_TAG_INPUT'); for (let i = 0; i < 2; i++) DRGrid.autoPlace(g, DR.item('quest-dog-tag')); DRCargo.refresh(); });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, 'w5-dogtaginput-1280.png') });
  await ev(page, () => DRCargo.close());
  await page.waitForFunction(() => DRCargo.isOpen() && DR.s.grids.SOLDIER_DOG_TAG_OUTPUT && DR.grid('SOLDIER_DOG_TAG_OUTPUT').items.length > 0, null, { timeout: 10000 }).catch(() => {});
  const d2 = await ev(page, () => ({ out: DR.s.grids.SOLDIER_DOG_TAG_OUTPUT ? DR.grid('SOLDIER_DOG_TAG_OUTPUT').items.map(i => i.id) : null, ret: DR.s.vars['dog-tags-returned'] }));
  ok(d2.out && d2.out.join() === 'research-item,research-item' && d2.ret === 2, 'Soldier_DogTagHandIn: ' + JSON.stringify(d2));
  await ev(page, () => DRCargo.close());
  await page.waitForFunction(() => window.__ended, null, { timeout: 10000 }).catch(() => {});
  // máy Xua đuổi qua node thật
  await ev(page, () => { DR.s.vars['banish-machine-expiry'] = 0; window.__bm.length = 0; window.__run('ResearchPontoon_MachineActivated'); });
  await page.waitForFunction(() => window.__ended, null, { timeout: 10000 }).catch(() => {});
  ok(await ev(page, () => DRQuestObj.banishActive() && DR.s.vars['banish-machine-expiry'] > DR.s.time), 'ResearchPontoon_MachineActivated did not switch the machine on');

  ok(!errors.length, 'errors: ' + errors.slice(0, 6).join(' | '));
  console.log('dredge-w5quest: ' + pass + ' passed, ' + fail + ' failed  (shots ' + OUT + ')');
  await br.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
