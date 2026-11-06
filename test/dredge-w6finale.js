/*
 * DREDGE - Bien Mu: W6a luong ket thuc (js/finale.js). Kiem theo WORLD-GAPS.md §6 W6a:
 *   ket xau: Collector_PickupOptions (Yes, Yes) -> Collector_PickupAccept -> forbidSave, dong ho dung, Finale_Root bat, dau ban do 'finale';
 *            lai thuyen (giu W) toi Finale_Root (-300 ; 0), F -> Finale_BadRoot -> Finale_BadRegular -> PlayBadFinaleCutscene
 *            -> thoi tiet FinaleStorm -> CutToCredits (credits W7) -> nhac music.credits.bad -> man dau, moi thu don sach.
 *   ket tot: LighthouseKeeper_FinaleOptions (Yes, Yes) -> LighthouseKeeper_FinaleAccepted -> hai dang chi ve Finale_Root (scale 120,5,5),
 *            vcam GreaterMarrowFinaleVCam -> Finale_Good (Throw it back x3) -> FinaleAurora, thuyen an, music.credits.good -> man dau.
 *   relic5 (WORLD-GAPS §7.1): ben Temple, dich Fanatic_PyreOptions -> Inspect -> luoi DSPyre (preset relic5) -> relic5 trong khoang.
 * Gia tri goc: FinaleCutscene_Bad/Good.playable (moc Signal Emitter), Game.unity LighthouseBeam &125078, FinalePOIEnabler, DredgeDialogueRunner.cs:793.
 * Chay: node test/dredge-w6finale.js     Ra: %TEMP%/dredge-w6finale/*.png (1280x720 va 844x390)   DR_URL=... de chay tren Pages.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w6finale');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const near = (a, b, tol, m) => ok(typeof a === 'number' && Math.abs(a - b) <= tol, m + ' (' + (typeof a === 'number' ? a.toFixed(3) : a) + ' ~ ' + b + ' +-' + tol + ')');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
const ROOT = process.env.DR_ROOT || path.resolve(__dirname, '..');
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url().split('/').slice(-3).join('/')); });
  return errors;
}
async function load(page, base) {
  await page.goto(base + '/games/dredge/index.html?fresh=1');
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
}
async function newGame(page) {
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await ev(page, () => window.DRIntro && DRIntro.playing && DRIntro.skip());
  await page.waitForFunction(() => !(window.DRIntro && DRIntro.playing), null, { timeout: 20000 });
  const t0 = Date.now();
  for (;;) {                                         // loi chao o ben (Mayor) toi khi giao dien ben san sang
    const s = await ev(page, () => {
      const d = DRDock._debug(), open = DRDialogue.isOpen(), live = !!DRYarn.current() || document.getElementById('dr-dlg').classList.contains('on');
      return { ready: !!d && d.phase === 'ui' && (!open || !live), st: open && live ? DRDialogue.state() : null };
    });
    if (s.ready) break;
    if (Date.now() - t0 > 40000) throw new Error('dock UI never reached phase ui');
    if (s.st && s.st.kind === 'options') await page.click('.dlg-opt[data-index="0"]').catch(() => {});
    else if (s.st) await page.keyboard.press('Space');
    await sleep(350);
  }
  await ev(page, () => DR.setMode('sail'));
  await sleep(500);
  await ev(page, () => DR_DEBUG.setTime(0.5));
  await sleep(400);
}
// di hoi thoai: Space cho dong, bam lua chon `pick(state)` (mac dinh 0) toi khi stop() dung
async function pump(page, stop, limit, pick) {
  for (let i = 0; i < (limit || 60); i++) {
    if (await ev(page, stop)) return true;
    const st = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (st && st.kind === 'options') { await sleep(800); await page.click('.dlg-opt[data-index="' + (pick ? pick(st) : 0) + '"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(380);
  }
  return ev(page, stop);
}
// lai that: dat thuyen cach Finale_Root 22 m ve phia dong, mui huong tay (yaw pi/2 = forward (-1, 0)), giu W toi khi hien "Kiem tra F"
async function sailToFinale(page, tag) {
  await ev(page, () => DR_DEBUG.teleport(-278, 0, Math.PI / 2));
  await sleep(800);
  await page.keyboard.down('KeyW');
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) { await sleep(150); reached = await ev(page, () => DRPoi._debug().near === 'Finale_Root'); }
  await page.keyboard.up('KeyW');
  ok(reached, 'giu W: thuyen toi cau tuong tac cua Finale_Root (' + tag + ')');
  await sleep(1300);
  await page.screenshot({ path: path.join(OUT, tag + '-poi-1280.png') });
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  return ev(page, () => DRDialogue.isOpen() && DRDialogue.state().node);
}
async function waitFired(page, sig, ms) {
  return page.waitForFunction(s => { const c = DRFinale.state().cut; return !!c && c.fired.includes(s); }, sig, { timeout: ms || 20000 }).then(() => true, () => false);
}
async function force5Relics(page) {
  await ev(page, () => {
    const v = DR.s.visitedNodes;
    for (const n of ['Collector_StrangeFish_Proposal_Accepted', 'Collector_Relic1Deliver', 'Collector_Relic2Deliver', 'Collector_Relic3Deliver',
      'Collector_Relic4Deliver', 'Collector_Relic5Deliver', 'Collector_AllRelicsFound']) if (!v.includes(n)) v.push(n);
    DR.s.vars['world-phase'] = 5;
  });
}

(async () => {
  const srv = await serve(), base = (process.env.DR_URL || 'http://localhost:' + srv.address().port).replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const allErr = [];
  try {
    // ======================================================== ket xau
    console.log('# ket xau (Collector)');
    let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    let errors = watch(page);
    await load(page, base);
    await newGame(page);
    const perf0 = await ev(page, async () => { await new Promise(r => setTimeout(r, 2500)); return DR_DEBUG.perf(); });
    console.log('  perf at sea: ' + JSON.stringify(perf0));
    ok(await ev(page, () => ['DoFinalePreparations', 'PlayBadFinaleCutscene', 'PlayGoodFinaleCutscene', 'EnableBadFinalePOI', 'TogglePointToFinalePOI',
      'UnlockPlayerMovement', 'ToggleLookAtFinaleVCam', 'DoFinaleCutscenePreparations', 'EnableGoodFinalePOI'].every(n => !DRYarn.stubs().includes(n))),
      '9 lenh finale khong con la stub');
    ok(await ev(page, () => !DRPoi.enabled(DRPoi.points.find(p => p.id === 'Finale_Root'))), 'Finale_Root tat truoc khi chon ket');
    await force5Relics(page);
    await ev(page, () => DRDialogue.start('Collector_PickupOptions'));
    // "I'm ready." -> canh bao lan 1 "Yes." -> lan 2 "Yes."
    ok(await pump(page, () => DRYarn.visited('Collector_PickupAccept') && !DRDialogue.isOpen(), 90), 'Collector_PickupOptions -> Yes, Yes -> Collector_PickupAccept chay het');
    let st = await ev(page, () => DRFinale.state());
    ok(st.forbidSave && (await ev(page, () => DR.save())) === false, 'DoFinalePreparations: forbidSave, DR.save() tra false');
    ok(st.voyage === 'bad' && st.beacon && st.poiOn && (await ev(page, () => DRPoi.enabled(DRPoi.points.find(p => p.id === 'Finale_Root')))), 'EnableBadFinalePOI: Finale_Root hien, cot sang BadEndingBeam chay');
    ok(await ev(page, () => (DR.s.mapMarkers || []).includes('finale')), 'AddMapMarker finale');
    ok(await ev(page, () => DR.s.weather === 'LightRain' && !DR.s.availableSpeakers.includes('LighthouseKeeper')), 'ChangeWeather LightRain, Lighthouse Keeper an');
    const tA = await ev(page, () => DR.s.time); await sleep(3000); const tB = await ev(page, () => DR.s.time);
    ok(st.frozen && tA === tB, 'dong ho dung (time-frozen): ' + tA + ' -> ' + tB);
    await ev(page, () => { DRFinale.timeScale = 10; DRMenus.credits.timeScale = 25; });
    const node = await sailToFinale(page, 'bad');
    ok(node === 'Finale_Root' || node === 'Finale_BadRoot', 'F chay Finale_Root (' + node + ')');
    ok(await ev(page, () => !!DRBoat.auto), 'AutoMovePOI: thuyen tu lai toi autoMoveDestination');
    ok(await pump(page, () => !!DRFinale.state().cut, 60), 'Finale_BadRoot -> Finale_BadRegular -> PlayBadFinaleCutscene');
    ok(await ev(page, () => DRYarn.visited('Finale_BadRegular')), 'nhanh Finale_BadRegular (chua gap Collector_Revealed)');
    const bp = await ev(page, () => ({ d: Math.hypot(DR.s.boat.x + 300, DR.s.boat.z), blocked: DRBoat.blocked, hit: DRBoat.lastHit }));
    ok(bp.blocked && (bp.hit === Infinity || bp.hit === null), 'canh ket: khoa lai, IgnoreDamage (lastHit ' + bp.hit + ')');
    near(bp.d, 0, 1.5, 'thuyen o diem ket (khoang cach toi (-300, 0))');
    ok(await waitFired(page, 'ChangeWeather', 8000), 'moc ChangeWeather 3,983 s');
    await sleep(300);
    ok(await ev(page, () => DRSky.weather.name === 'FinaleStorm' && DR_ENV.weather.transitionSec === 10), 'TransitionToWeather FinaleStorm, chuyen 10 s');
    ok(await ev(page, () => !DRFinale.state().ui && getComputedStyle(document.getElementById('dr-hud')).opacity === '0' && getComputedStyle(document.getElementById('dr-ab')).opacity === '0'), 'ToggleGameUI(false): HUD an');
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'bad-cutscene-1280.png') });
    ok(await waitFired(page, 'CutToCredits', 10000), 'moc CutToCredits 50,2 s');
    ok(await ev(page, () => DRMenus.credits.playing && DRMenus.credits.state.mode === 'game'), 'credits W7 che do game');
    ok(await ev(page, () => DRFinale.state().vcam && DRFinale.state().vcam.which === 'Credits_VCam'), 'creditsVCam bat');
    ok(await waitFired(page, 'PlayBadCreditsMusic', 5000), 'moc PlayBadCreditsMusic 58 s');
    await sleep(200);
    const aud = await ev(page, () => DRAudio.state().stinger);
    ok(aud === 'music.credits.bad', 'nhac music.credits.bad dang phat (' + aud + ')');
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'bad-credits-1280.png') });
    ok(await page.waitForFunction(() => DR.mode === 'title', null, { timeout: 60000 }).then(() => true, () => false), 'het credits -> man dau');
    await sleep(500);
    st = await ev(page, () => ({ s: DRFinale.state(), vis: DRBoat.root.visible, title: !document.getElementById('dr-title').hidden, ov: DRCamera.override, hit: DRBoat.lastHit, bl: DRBoat.blocked }));
    ok(st.title && !st.s.cut && st.s.ui && st.vis && !st.s.vcam && st.ov === null && st.hit === 0 && !st.bl, 'man dau: canh ket don sach (UI, thuyen, camera, khoa)');
    await page.screenshot({ path: path.join(OUT, 'bad-title-1280.png') });
    allErr.push(...errors.map(e => 'bad: ' + e));
    await page.close();

    // ======================================================== ket tot
    console.log('# ket tot (Lighthouse Keeper)');
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    errors = watch(page);
    await load(page, base);
    await newGame(page);
    await force5Relics(page);
    await ev(page, () => DR_DEBUG.teleport(30, -5, 0));
    await sleep(800);
    await ev(page, () => DRDialogue.start('LighthouseKeeper_FinaleOptions'));
    let sawVcam = false, sawPoint = false;
    for (let i = 0; i < 80; i++) {
      const s = await ev(page, () => ({ st: DRFinale.state(), done: DRYarn.visited('LighthouseKeeper_FinaleAccepted') && !DRDialogue.isOpen() }));
      if (s.st.vcam && s.st.vcam.which === 'GreaterMarrowFinaleVCam' && s.st.vcam.dir > 0) sawVcam = true;
      if (s.st.beam.pointing) sawPoint = true;
      if (sawVcam && i % 6 === 5) await page.screenshot({ path: path.join(OUT, 'good-vcam-1280.png') });
      if (s.done) break;
      const d = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
      if (d && d.kind === 'options') { await sleep(800); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
      else if (d) await page.keyboard.press('Space');
      await sleep(450);
    }
    ok(await ev(page, () => DRYarn.visited('LighthouseKeeper_FinaleAccepted')), 'Yes, Yes -> LighthouseKeeper_FinaleAccepted');
    ok(sawVcam, 'ToggleLookAtFinaleVCam(true): GreaterMarrowFinaleVCam trong luc noi');
    ok(sawPoint, 'TogglePointToFinalePOI(true)');
    st = await ev(page, () => DRFinale.state());
    ok(st.voyage === 'good' && st.poiOn && st.forbidSave && st.frozen, 'EnableGoodFinalePOI + DoFinalePreparations');
    await sleep(3200);
    st = await ev(page, () => DRFinale.state());
    ok(st.beam.scale && st.beam.scale[0] === 120 && st.beam.scale[1] === 5 && st.beam.scale[2] === 5, 'DOScale 2,5 s toi pointingScale (120, 5, 5): ' + JSON.stringify(st.beam.scale));
    const dir = await ev(page, () => DRFinale.beamDir());
    near(dir && dir.dot, 1, 0.01, 'truc +x cua tia hai dang chi ve Finale_Root (cos goc)');
    ok(!st.vcam, 'ToggleLookAtFinaleVCam(false): tra camera');
    await ev(page, () => { const b = DRWorld.ambient.beam; DR_DEBUG.teleport(b.L.rootPos[0] + 30, b.L.rootPos[2] + 25, 0.9); DR_DEBUG.setTime(0.95); });
    await sleep(2500);
    await page.screenshot({ path: path.join(OUT, 'good-beam-1280.png') });
    await ev(page, () => { DRFinale.timeScale = 10; DRMenus.credits.timeScale = 25; });
    const node2 = await sailToFinale(page, 'good');
    ok(node2 === 'Finale_Root' || node2 === 'Finale_Good', 'F chay Finale_Root (' + node2 + ')');
    ok(await pump(page, () => !!DRFinale.state().cut, 60), 'Finale_Good: Throw it back x3 -> PlayGoodFinaleCutscene');
    ok(await ev(page, () => DRYarn.visited('Finale_Good') && DRFinale.state().cut.kind === 'good'), 'nhanh Finale_Good (LighthouseKeeper_FinaleAccepted da tham)');
    ok(await waitFired(page, 'TurnOffBoatModel', 8000), 'moc TurnOffBoatModel 24,15 s');
    ok(await ev(page, () => !DRBoat.root.visible), 'ToggleBoatModel(false): thuyen an');
    ok(await waitFired(page, 'ChangeWeatherToAurora', 5000), 'moc ChangeWeatherToAurora 28,5 s');
    await sleep(300);
    ok(await ev(page, () => DRSky.weather.name === 'FinaleAurora'), 'TransitionToWeather FinaleAurora');
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, 'good-cutscene-1280.png') });
    ok(await waitFired(page, 'TurnOffLighthousePoint', 8000), 'moc TurnOffLighthousePoint 43,03 s');
    ok(await ev(page, () => !DRFinale.state().beam.pointing), 'ToggleLighthousePointing(false)');
    ok(await waitFired(page, 'PlayGoodCreditsMusic', 5000), 'moc PlayGoodCreditsMusic 49,8 s');
    await sleep(200);
    const aud2 = await ev(page, () => DRAudio.state().stinger);
    ok(aud2 === 'music.credits.good', 'nhac music.credits.good dang phat (' + aud2 + ')');
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, 'good-credits-844.png') });
    ok(await page.waitForFunction(() => DR.mode === 'title', null, { timeout: 60000 }).then(() => true, () => false), 'het credits -> man dau');
    await sleep(500);
    st = await ev(page, () => ({ s: DRFinale.state(), vis: DRBoat.root.visible, w: DRSky.weather.name }));
    ok(!st.s.cut && st.s.ui && st.vis && !st.s.beam.pointing, 'man dau: thuyen hien lai, hai dang quay lai (' + st.w + ')');
    await page.screenshot({ path: path.join(OUT, 'good-title-844.png') });
    allErr.push(...errors.map(e => 'good: ' + e));
    await page.close();

    // ======================================================== relic5 (WORLD-GAPS §7.1)
    console.log('# relic5: Fanatic_PyreOptions -> luoi DSPyre');
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    errors = watch(page);
    await load(page, base);
    await newGame(page);
    await ev(page, () => DRDialogue.start('Fanatic_PyreOptions'));
    let got = false;
    for (let i = 0; i < 40 && !got; i++) {
      const take = await page.$('button[data-act="take"]');
      if (take && await take.isVisible()) { await sleep(800); await take.click(); await sleep(900); }
      got = await ev(page, () => DR.grid('INVENTORY').items.some(i => i.id === 'relic5'));
      if (got) break;
      const d = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
      if (d && d.kind === 'options') { await sleep(800); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
      else if (d && !take) await page.keyboard.press('Space');
      await sleep(400);
    }
    ok(got, 'relic5 vao khoang tu luoi DSPyre (ShowQuestGrid, presetGrid relic5)');
    await pump(page, () => !DRDialogue.isOpen(), 20);
    ok(await ev(page, () => DRYarn.visited('Fanatic_PyreComplete')), 'Fanatic_PyreComplete (GetLastQuestGridResult = 1)');
    allErr.push(...errors.map(e => 'relic5: ' + e));
    await page.close();
  } catch (e) {
    console.error(e); fail++;
  } finally {
    await browser.close(); srv.close();
  }
  const noise = allErr.filter(e => !/AudioContext|autoplay/i.test(e));
  ok(noise.length === 0, 'khong pageerror / loi console / HTTP >= 400' + (noise.length ? ': ' + noise.slice(0, 4).join(' | ') : ''));
  console.log('\nW6 finale: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
