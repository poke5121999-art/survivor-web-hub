/*
 * DREDGE - Bien Mu: W6b hai canh ket theo timeline goc (js/finale_cut.js, tools/finale.py). Kiem theo WORLD-GAPS.md §6 W6b:
 *   ket xau: luong that (Collector_PickupOptions Yes, Yes -> lai toi Finale_Root -> F -> Finale_BadRegular) -> PlayBadFinaleCutscene chay
 *            FinaleCutscene_Bad.playable dai 77,983 s (+-0,5 s, gio that, DRFinale.timeScale = 1), 13 moc Signal Emitter dung thu tu,
 *            vcam Cinematic_VCamBad (FOV 40 -> 30 theo Recorded (2)_8), Masstrocity troi tu y -750 len 0, Julie noi len y 1,258,
 *            DestroyGreaterMarrow 57,5 s: instance GM_Town + Lighthouse an (ma tran 0), tia hai dang an, GM_RuinedTown hien;
 *            het credits -> man dau: tra lai het.
 *   ket tot: FinaleCutscene_Good.playable (Shot1 -> Shot2 luc 20 s -> Credits_VCam), Leviathan troi len, fogRemove -> 1.
 * Gia tri goc: MonoBehaviour/FinaleCutscene_*.playable, AnimationClip Recorded*, Game.unity (PlayableDirector &122906, FinaleCutsceneLogic).
 * Chay: node test/dredge-w6bcut.js     Ra: %TEMP%/dredge-w6bcut/*.png (1280x720 va 844x390)   DR_URL=... de chay tren Pages.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = (page, f, a) => page.evaluate(f, a);
const OUT = path.join(process.env.SHOTS || os.tmpdir(), 'dredge-w6bcut');
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
  for (;;) {
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
async function pump(page, stop, limit) {
  for (let i = 0; i < (limit || 60); i++) {
    if (await ev(page, stop)) return true;
    const st = await ev(page, () => DRDialogue.isOpen() ? DRDialogue.state() : null);
    if (st && st.kind === 'options') { await sleep(800); await page.click('.dlg-opt[data-index="0"]').catch(() => {}); }
    else if (st) await page.keyboard.press('Space');
    await sleep(380);
  }
  return ev(page, stop);
}
async function force5Relics(page) {
  await ev(page, () => {
    const v = DR.s.visitedNodes;
    for (const n of ['Collector_StrangeFish_Proposal_Accepted', 'Collector_Relic1Deliver', 'Collector_Relic2Deliver', 'Collector_Relic3Deliver',
      'Collector_Relic4Deliver', 'Collector_Relic5Deliver', 'Collector_AllRelicsFound']) if (!v.includes(n)) v.push(n);
    DR.s.vars['world-phase'] = 5;
  });
}
async function sailToFinale(page) {
  await ev(page, () => DR_DEBUG.teleport(-278, 0, Math.PI / 2));
  await sleep(800);
  await page.keyboard.down('KeyW');
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) { await sleep(150); reached = await ev(page, () => DRPoi._debug().near === 'Finale_Root'); }
  await page.keyboard.up('KeyW');
  await sleep(1300);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => DRDialogue.isOpen(), null, { timeout: 5000 }).catch(() => {});
  return reached;
}
const cutAt = (page, t, ms) => page.waitForFunction(t => { const s = DRFinaleCut.state(); return s && (s.t >= t || s.done); }, t, { timeout: ms || 120000 }).then(() => true, () => false);
const st = page => ev(page, () => DRFinaleCut.state());
// chi so instances.bin cua GM_Town + Lighthouse: bao nhieu da dung trong cac o, bao nhieu co ma tran co ve 0
const gmInst = page => ev(page, () => {
  const want = new Set(DR_FINALE.gm.inst), m = new THREE.Matrix4();
  let n = 0, z = 0;
  for (const c of Object.values(DRWorld.cells)) if (c.group) for (const im of c.group.children) {
    if (!im.isInstancedMesh || im.userData.off === undefined) continue;
    for (let k = 0; k < im.count; k++) if (want.has(im.userData.off + k)) { n++; im.getMatrixAt(k, m); if (Math.abs(m.determinant()) < 1e-9) z++; }
  }
  return { n, z, beam: DRWorld.ambient.beam.rootG.visible };
});

(async () => {
  const srv = await serve(), base = (process.env.DR_URL || 'http://localhost:' + srv.address().port).replace(/\/$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const allErr = [];
  try {
    // ======================================================== ket xau
    console.log('# ket xau: FinaleCutscene_Bad.playable');
    let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    let errors = watch(page);
    await load(page, base);
    const data = await ev(page, () => ({ bad: DR_FINALE.timelines.bad.len, good: DR_FINALE.timelines.good.len, sig: DR_FINALE.timelines.bad.signals.length,
      inst: DR_FINALE.gm.inst.length, stub: !!(window.DRFinaleCut && DRFinaleCut.play) }));
    near(data.bad, 77.983, 0.001, 'do dai timeline Bad (track Credits_VCam 58 + 19,983)');
    near(data.good, 300, 0.001, 'do dai timeline Good (Activation Track (5) 49,8 + 250,2)');
    ok(data.sig === 13 && data.inst === 4 && data.stub, '13 moc Bad, 4 instance GM_Town + Lighthouse, DRFinaleCut.play co');
    await newGame(page);
    const g0 = await gmInst(page);
    ok(g0.n > 0 && g0.z === 0 && g0.beam, 'truoc canh ket: Greater Marrow + hai dang dang hien (' + g0.n + ' instance dung)');
    await force5Relics(page);
    await ev(page, () => DRDialogue.start('Collector_PickupOptions'));
    ok(await pump(page, () => DRYarn.visited('Collector_PickupAccept') && !DRDialogue.isOpen(), 90), 'Collector_PickupOptions -> Yes, Yes -> Collector_PickupAccept');
    ok(await sailToFinale(page), 'giu W toi Finale_Root, F');
    ok(await pump(page, () => !!DRFinale.state().cut, 60), 'Finale_BadRoot -> Finale_BadRegular -> PlayBadFinaleCutscene');
    let s = await ev(page, () => ({ w6: DRFinale.state().cut, c: DRFinaleCut.state() }));
    ok(s.w6.ext === true && s.c.kind === 'bad', 'W6a giao timeline cho W6b (cut.ext), DRFinaleCut chay "bad"');
    ok(await page.waitForFunction(() => DRFinaleCut.state().playing, null, { timeout: 10000 }).then(() => true, () => false), 'cut.bin nap xong, dong ho timeline chay');
    await cutAt(page, 3);
    s = await st(page);
    ok(s.vcam === 'Cinematic_VCamBad', 'vcam song: Cinematic_VCamBad (Priority 100) (' + s.vcam + ')');
    near(s.fov, 40, 0.05, 'FOV Cinematic_VCamBad truoc 15,05 s');
    await cutAt(page, 10);
    const m10 = await ev(page, () => DRFinaleCut.debug.worldPos('Masstrocity'));
    ok(m10 && m10[1] < -500, 'Masstrocity con chim duoi bien luc 10 s (y ' + (m10 && m10[1]) + ')');
    await cutAt(page, 13);
    s = await st(page);
    ok(s.audio.some(a => /Music Box/.test(a)) && s.audio.some(a => /Rumble/.test(a)), 'Audio track: Music Box (11,5 s) + Rumble BadEndingSFX (5,5 s) dang phat: ' + s.audio.join(', '));
    await cutAt(page, 25);
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, 'bad-julie-1280.png') });
    await cutAt(page, 39.5);
    s = await st(page);
    ok(['Masstrocity', 'Julie', 'RedBackGlow', 'MusicBox'].every(n => s.active.includes(n)), 'BadEndingCutsceneContainer bat: ' + s.active.join(', '));
    await page.screenshot({ path: path.join(OUT, 'bad-masstrocity-1280.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await cutAt(page, 44.5);
    await page.screenshot({ path: path.join(OUT, 'bad-masstrocity-844.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    s = await st(page);
    near(s.fov, 30, 0.05, 'FOV 30 sau khoa 38,78 s (gio clip; clip bat dau 5,5 s => 44,28 s timeline) cua m_Lens.FieldOfView');
    await cutAt(page, 46);
    const p46 = await ev(page, () => ({ m: DRFinaleCut.debug.worldPos('Masstrocity'), j: DRFinaleCut.debug.worldPos('Julie') }));
    near(p46.m && p46.m[1], 0, 0.5, 'Masstrocity troi het (Recorded (4)_13: y -750 -> 0 luc 5,5 + 39,92 s, sau do Hold)');
    near(p46.j && p46.j[1], 1.258, 0.05, 'Julie noi len (Recorded (1)_11: offset y -10 + 11,258)');
    s = await st(page);
    ok(s.active.length === 0, 'het Activation Track 45,5 s: canh tat (' + s.active.join(',') + ')');
    await cutAt(page, 57.4);
    const g1 = await gmInst(page);
    ok(g1.z === 0 && g1.beam, 'truoc DestroyGreaterMarrow 57,5 s: Greater Marrow con nguyen');
    await cutAt(page, 60);
    await page.waitForFunction(() => DRFinaleCut.state().gm.ruins, null, { timeout: 10000 }).catch(() => {});
    const g2 = await gmInst(page);
    s = await st(page);
    ok(g2.n > 0 && g2.z === g2.n && !g2.beam, 'DestroyGreaterMarrow: ' + g2.z + '/' + g2.n + ' instance GM_Town + Lighthouse co ve 0, tia hai dang an');
    ok(s.gm.hidden && s.gm.ruins && s.vcam === 'Credits_VCam', 'GM_RuinedTown hien, camera Credits_VCam');
    ok(await ev(page, () => DRFinale.state().cut.fired.includes('DestroyGreaterMarrow')), 'W6a nhan moc DestroyGreaterMarrow');
    await cutAt(page, 70);
    await page.screenshot({ path: path.join(OUT, 'bad-ruins-1280.png') });
    const cy = await ev(page, () => DRCamera.cam.position.y);
    ok(cy < 19 - 3, 'Credits_VCam ha xuong theo Recorded (6)_3 (y ' + cy.toFixed(2) + ' < 16)');
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, 'bad-ruins-844.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    ok(await page.waitForFunction(() => DRFinaleCut.state().done, null, { timeout: 20000 }).then(() => true, () => false), 'timeline Bad ket thuc');
    s = await st(page);
    const wall = (s.wall[1] - s.wall[0]) / 1000;
    near(wall, 77.983, 0.5, 'thoi gian that cua timeline Bad (giay)');
    const fired = await ev(page, () => DRFinale.state().cut.fired);
    const want = ['ToggleUI', 'ChangeWeather', 'FlickerLights', 'ToggleEngineAudioOff', 'FadeOutGameSFX', 'VibrationType1', 'VibrationType2', 'VibrationType3',
      'ToggleScrimOn', 'CutToCredits', 'DestroyGreaterMarrow', 'PlayBadCreditsMusic', 'ToggleScrimOff'];
    ok(JSON.stringify(fired) === JSON.stringify(want), '13 moc dung thu tu: ' + fired.join(','));
    const g3 = await gmInst(page);
    ok(g3.z === g3.n && !g3.beam, 'het timeline (credits van chay): Greater Marrow van tan');
    await ev(page, () => { DRMenus.credits.timeScale = 25; });
    ok(await page.waitForFunction(() => DR.mode === 'title', null, { timeout: 90000 }).then(() => true, () => false), 'het credits -> man dau');
    await sleep(800);
    const g4 = await gmInst(page);
    s = await st(page);
    ok(g4.z === 0 && g4.beam && !s.gm.hidden && !s.gm.ruins && (await ev(page, () => DRCamera.override === null && !document.getElementById('dr-finale-vignette'))),
      'man dau (LoadTitleFromGame): Greater Marrow, tia hai dang tra lai, tan tich go, camera tra');
    allErr.push(...errors.map(e => 'bad: ' + e));
    await page.close();

    // ======================================================== ket tot
    console.log('# ket tot: FinaleCutscene_Good.playable (DRFinale.timeScale 3)');
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    errors = watch(page);
    await load(page, base);
    await newGame(page);
    await force5Relics(page);
    await ev(page, () => DR_DEBUG.teleport(30, -5, 0));
    await sleep(800);
    await ev(page, () => DRDialogue.start('LighthouseKeeper_FinaleOptions'));
    ok(await pump(page, () => DRYarn.visited('LighthouseKeeper_FinaleAccepted') && !DRDialogue.isOpen(), 90), 'LighthouseKeeper_FinaleOptions -> FinaleAccepted');
    await ev(page, () => { DRFinale.timeScale = 3; });
    ok(await sailToFinale(page), 'giu W toi Finale_Root, F');
    ok(await pump(page, () => !!DRFinale.state().cut, 60), 'Finale_Good: Throw it back x3 -> PlayGoodFinaleCutscene');
    await page.waitForFunction(() => DRFinaleCut.state().playing, null, { timeout: 10000 }).catch(() => {});
    await cutAt(page, 8);
    s = await st(page);
    const h8 = await ev(page, () => DRFinaleCut.debug.worldPos('headroot_jnt'));
    ok(s.kind === 'good' && s.vcam === 'Cinematic_VCamGoodShot1', 'vcam Shot1 (container 0-20 s) (' + s.vcam + ')');
    ok(h8 && h8[1] < 0, 'Leviathan con duoi nuoc luc 8 s (headroot_jnt y ' + (h8 && h8[1]) + ')');
    await cutAt(page, 22);
    s = await st(page);
    ok(s.vcam === 'Cinematic_VCamGoodShot2', 'vcam Shot2 tu 20 s (' + s.vcam + ')');
    await cutAt(page, 26);
    const h26 = await ev(page, () => DRFinaleCut.debug.worldPos('headroot_jnt'));
    ok(h26 && h26[1] > h8[1] + 10, 'Leviathan troi len (Chomp_0) (headroot_jnt y ' + (h26 && h26[1]) + ')');
    await ev(page, () => { DRFinale.timeScale = 0.0001; });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, 'good-leviathan-1280.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'good-leviathan-844.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    await ev(page, () => { DRFinale.timeScale = 3; });
    await cutAt(page, 36);
    const fr = await ev(page, () => DRSky.uniforms.uDrFogR.value);
    ok(fr > 0.9, 'fogRemove (Recorded (5)) -> _FogRemove ' + fr.toFixed(3));
    await page.screenshot({ path: path.join(OUT, 'good-aurora-1280.png') });
    await cutAt(page, 52);
    s = await st(page);
    ok(s.vcam === 'Credits_VCam' && s.active.includes('AuroraEffect'), 'sau CutToCredits: Credits_VCam, GoodEndingCreditsContainer/AuroraEffect bat');
    await ev(page, () => { DRMenus.credits.timeScale = 25; });
    ok(await page.waitForFunction(() => DR.mode === 'title', null, { timeout: 90000 }).then(() => true, () => false), 'het credits -> man dau');
    await sleep(800);
    s = await st(page);
    const fr2 = await ev(page, () => DRSky.uniforms.uDrFogR.value);
    ok(!s.playing && s.kind === null && fr2 === 0, 'man dau: canh ket go, _FogRemove tra 0');
    allErr.push(...errors.map(e => 'good: ' + e));
    await page.close();
  } catch (e) {
    console.error(e); fail++;
  } finally {
    await browser.close(); srv.close();
  }
  const noise = allErr.filter(e => !/AudioContext|autoplay/i.test(e));
  ok(noise.length === 0, 'khong pageerror / loi console / HTTP >= 400' + (noise.length ? ': ' + noise.slice(0, 4).join(' | ') : ''));
  console.log('\nW6b cutscenes: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
