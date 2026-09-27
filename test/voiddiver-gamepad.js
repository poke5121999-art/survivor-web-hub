/*
 * VOID DIVER — kiểm tay cầm (tay cầm giả qua navigator.getGamepads, đặt bằng page.addInitScript trước khi trang chạy).
 * Mở tutorial 1100, dùng tay cầm: đổi thiết bị (body[data-input-device]), ảnh nút XBox ở hộp thoại / khung bỏ qua / HUD /
 * lời nhắc tương tác, bảng hướng dẫn trên sàn nhóm Gamepad (ImgTuto0xPad), giữ B bỏ qua thoại, cần trái đi, cần phải ngắm,
 * Y đánh thường, bấm cần trái bật chạy (tự tắt khi đứng yên), A giữ để tương tác (Elara → TalkToEll_1), D-pad chọn ô nhanh.
 * Bấm phím thật thì quay về bàn phím (ảnh phím, nhóm Keyboard).
 *
 * Chạy:  node test/voiddiver-gamepad.js [--seed=7]
 *        VD_BASE=https://poke5121999-art.github.io/survivor-web-hub node test/voiddiver-gamepad.js
 * Ảnh ở %TEMP%/voiddiver-gamepad-shots/.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-gamepad-shots');
const OPT = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
const SEED = +(OPT.seed || 7);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.css': 'text/css', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.skel': 'application/octet-stream', '.atlas': 'text/plain', '.woff2': 'font/woff2' };

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name + (detail != null ? '  (' + detail + ')' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail != null ? '  (' + detail + ')' : '')); }
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(page, name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); console.log('    ảnh: ' + f); }

// Tay cầm giả "standard mapping": window.__pad.set(nút, 0..1), window.__pad.axes[i] = −1..1.
const FAKE_PAD = () => {
  const P = window.__pad = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0], ts: 0,
    set(i, v) { this.buttons[i] = v; this.ts++; }, stick(i, x, y) { this.axes[i * 2] = x; this.axes[i * 2 + 1] = y; this.ts++; },
    reset() { this.buttons.fill(0); this.axes.fill(0); this.ts++; } };
  const snap = () => ({ id: 'Xbox Wireless Controller (fake)', index: 0, connected: true, mapping: 'standard', timestamp: P.ts,
    axes: P.axes.slice(), buttons: P.buttons.map(v => ({ pressed: v > 0.5, touched: v > 0, value: v })) });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [snap(), null, null, null] });
};

async function run(browser, base, errors) {
  console.log(`\n== Tay cầm trong tutorial 1100 (seed ${SEED})`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.addInitScript(FAKE_PAD);
  await page.goto(`${base}/games/voiddiver/index.html?campaign=1100&seed=${SEED}&char=100001`);
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 240000 });

  const press = async (i, ms) => { await page.evaluate(i => window.__pad.set(i, 1), i); await sleep(ms || 120); await page.evaluate(i => window.__pad.set(i, 0), i); await sleep(60); };
  const dev = () => page.evaluate(() => ({ input: VD.input.device, body: document.body.dataset.inputDevice }));

  // ---- 0. mở màn: tutorial không có thẻ CampaignStartPopup; lớp phủ IntroTimelineObject che HUD tới IntroFinish (8,3 s)
  const intro = await page.evaluate(() => ({ state: VD.dive.state, card: !!document.querySelector('.vd-introcard'), fade: !!document.querySelector('.vd-introfade'),
    end: +(VD.dive.introEnd - VD.dive.t).toFixed(2), matte: (document.querySelector('.vd-introfade .matte') || {}).style }));
  check('mở màn tutorial: không thẻ tên, lớp phủ Intro, vào play sau ~8,3 s', intro.state === 'intro' && !intro.card && intro.fade && intro.end > 7 && intro.end <= 8.31, JSON.stringify({ state: intro.state, card: intro.card, fade: intro.fade, end: intro.end }));
  await sleep(1500); await shot(page, 'pad-00-intro');
  // ---- 1. chạm tay cầm → GamePad
  await press(0);
  let d = await dev();
  check('bấm A → thiết bị GamePad', d.input === 'gamepad' && d.body === 'gamepad', JSON.stringify(d));

  // ---- 2. hộp thoại mở màn (Step_00003): ảnh nút A / RT / B, phím F (chỉ bàn phím) ẩn
  await page.waitForFunction(() => VD.dialog && VD.dialog.open && VD.dialog.box.style.visibility !== 'hidden', null, { timeout: 90000 });
  await sleep(700);
  const hint = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.vd-dialog .vd-dlg-box .vd-dlg-hint img')].map(i => ({ src: i.getAttribute('src'), hidden: i.hidden, kb: i.dataset.kb }));
    const skip = document.querySelector('.vd-dlg-skip img'); return { imgs, skip: skip && skip.getAttribute('src') };
  });
  const vis = hint.imgs.filter(i => !i.hidden).map(i => i.src.replace(/.*\//, ''));
  check('hộp thoại: [A] Tiếp theo, [RT] Bỏ qua nhanh; F ẩn', JSON.stringify(vis) === JSON.stringify(['south.webp', 'r2.webp']) && hint.imgs.some(i => i.kb === 'F_Key' && i.hidden), JSON.stringify(vis));
  check('khung bỏ qua: nút B (Ui/Escape)', /pad\/east\.webp$/.test(hint.skip || ''), hint.skip);
  await shot(page, 'pad-01-dialog');
  // A = Ui/Skip: sang dòng kế
  const txt0 = await page.evaluate(() => VD.dialog.text.textContent);
  await sleep(600); await press(0); await sleep(2000);   // sau dòng 1 Lua còn FadeOutDialog + DelayDialogAsync(1000)
  const txt1 = await page.evaluate(() => VD.dialog.text.textContent);
  check('A → dòng thoại kế', txt0 !== txt1, JSON.stringify([txt0.slice(0, 20), txt1.slice(0, 20)]));
  // Giữ B 1,2 s (SkipHoldDuration 1,0) → bỏ qua cả đoạn
  await page.evaluate(() => window.__pad.set(1, 1)); await sleep(1300); await page.evaluate(() => window.__pad.set(1, 0));
  const closed = await page.waitForFunction(() => !VD.dialog.open, null, { timeout: 30000 }).then(() => true, () => false);
  check('giữ B 1 s → bỏ qua thoại mở màn', closed);
  await sleep(600);

  // ---- 3. bảng hướng dẫn nhóm Gamepad
  const g = await page.evaluate(() => ({ kb: VD.tutorial.sets && VD.tutorial.sets.keyboard.visible, pad: VD.tutorial.sets && VD.tutorial.sets.gamepad.visible,
    list: VD.tutorial.list('gamepad').map(x => x.sector + '/' + x.guide + ':' + x.parts.join('+')) }));
  check('bảng trên sàn: nhóm Gamepad hiện, Keyboard ẩn', g.pad === true && g.kb === false, JSON.stringify({ kb: g.kb, pad: g.pad }));
  check('nhóm Gamepad dùng ảnh ImgTuto0xPad', ['ImgTuto01Pad', 'ImgTuto02Pad', 'ImgTuto03Pad', 'ImgTuto04Pad', 'ImgTuto06Pad'].every(t => g.list.some(s => s.includes(t))), g.list.length + ' bảng');
  await shot(page, 'pad-02-move-guide');

  // ---- 4. HUD: nhãn ô skill, bảng Hướng Dẫn, lời nhắc tương tác
  const hud = await page.evaluate(() => {
    const pk = [...document.querySelectorAll('.vd-skill .padk')].map(i => ({ src: i.getAttribute('src').replace(/.*\//, ''), shown: getComputedStyle(i).display !== 'none' }));
    const kg = [...document.querySelectorAll('.vd-keyguide img')].map(i => i.getAttribute('src').replace(/.*\//, ''));
    return { pk, kg };
  });
  check('ô skill: Y X B RB RT LT', hud.pk.map(p => p.src).join(',') === 'north.webp,west.webp,east.webp,r1.webp,r2.webp,l2.webp' && hud.pk.every(p => p.shown), hud.pk.map(p => p.src).join(','));
  check('bảng Hướng Dẫn: Y B LS View Menu + unbound cho O', hud.kg.join(',') === 'north.webp,east.webp,lStick_Click.webp,Select.webp,Start.webp,unbound.webp', hud.kg.join(','));

  // ---- 5. cần trái đi, cần phải ngắm, Y đánh
  const p0 = await page.evaluate(() => ({ x: VD.stage.player.pos.x, z: VD.stage.player.pos.z }));
  await page.evaluate(() => window.__pad.stick(0, 0, -1)); await sleep(300);   // trục y của trình duyệt: −1 = đẩy lên
  const mv = await page.evaluate(() => { const m = VD.stage.player.input.move, f = VD.render.screenAxes().fwd, l = Math.hypot(m.x, m.z) || 1; return (m.x * f.x + m.z * f.z) / l; });
  await sleep(300); await page.evaluate(() => window.__pad.stick(0, 0, 0)); await sleep(150);
  const p1 = await page.evaluate(() => ({ x: VD.stage.player.pos.x, z: VD.stage.player.pos.z }));
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('cần trái lên → đi về phía trên màn hình', moved > 0.8 && mv > 0.99, moved.toFixed(2) + ' m, hướng·trên = ' + mv.toFixed(2));
  await page.evaluate(() => window.__pad.stick(1, -1, 0)); await sleep(700);
  const aimL = await page.evaluate(() => { const a = VD.stage.player.input.aim, r = VD.render.screenAxes().right; return a.x * r.x + a.z * r.z; });
  await page.evaluate(() => window.__pad.stick(1, 1, 0)); await sleep(700);
  const aimR = await page.evaluate(() => { const a = VD.stage.player.input.aim, r = VD.render.screenAxes().right; return a.x * r.x + a.z * r.z; });
  await page.evaluate(() => window.__pad.stick(1, 0, 0)); await sleep(400);
  check('cần phải trái/phải → ngắm theo', aimL < -0.7 && aimR > 0.7, aimL.toFixed(2) + ' / ' + aimR.toFixed(2));
  const off = await page.evaluate(() => VD.input.aimPad.active);
  check('thả cần phải 0,15 s → tắt AimPad', off === false);
  await page.evaluate(() => window.__pad.set(3, 1));
  const atk = await page.waitForFunction(() => { const p = VD.stage.player; return !!(p.run && p.run.id === VD.Skill.slotSkill(p, 'attack')); }, null, { timeout: 2000 }).then(() => true, () => false);
  await page.evaluate(() => window.__pad.set(3, 0));
  check('Y → đánh thường', atk);
  await page.waitForFunction(() => !VD.stage.player.run, null, { timeout: 4000 }).catch(() => {});

  // ---- 6. bấm cần trái (Run) khi đang đi: bật chạy; đứng yên > 0,15 s: tự tắt
  await page.evaluate(() => window.__pad.stick(0, 0, -1)); await sleep(250);
  await press(10, 100); await sleep(300);
  const running = await page.evaluate(() => ({ t: VD.stage.player.runToggle, r: VD.stage.player.running }));
  await page.evaluate(() => window.__pad.stick(0, 0, 0)); await sleep(450);
  const stopped = await page.evaluate(() => VD.stage.player.runToggle);
  check('bấm cần trái khi đi → chạy', running.t === true && running.r === true, JSON.stringify(running));
  check('đứng yên → tự tắt chạy (ToggleRunExpireDelay)', stopped === false);
  // bấm lúc đứng yên: 0,15 s sau là tắt (UpdateRun: Idle quá hạn)
  await press(10, 80); await sleep(350);
  check('bấm chạy lúc đứng yên → tắt sau 0,15 s', await page.evaluate(() => VD.stage.player.runToggle === false));

  // ---- 7. D-pad: chọn ô nhanh
  await press(15); await press(15);
  const q = await page.evaluate(() => ({ k: VD.input.padQuick, sel: [...document.querySelectorAll('.vd-item')].findIndex(e => e.classList.contains('padsel')) }));
  check('D-pad phải ×2 → ô nhanh 3 được chọn', q.k === 2 && q.sel === 2, JSON.stringify(q));
  await press(14); await press(14); await press(14);
  check('D-pad trái vòng quanh (0 → 4)', await page.evaluate(() => VD.input.padQuick) === 4);

  // ---- 8. tới Elara, lời nhắc hiện nút A, giữ A → TalkToEll_1
  const ell = await page.evaluate(() => { const e = VD.dive.ents.find(e => e.kind === 'trigger' && e.triggerId === 11002) || VD.dive.ents.find(e => e.kind === 'npc'); return e ? { x: e.pos.x, z: e.pos.z } : null; });
  if (ell) {
    await page.evaluate(([x, z]) => VD.dive.debug.teleport(x + 0.8, z), [ell.x, ell.z]);
    await sleep(500);
    const pr = await page.evaluate(() => { const i = document.querySelector('.vd-prompt .padk'), b = document.querySelector('.vd-prompt .key b');
      return { shown: !!i && getComputedStyle(i).display !== 'none', src: i && i.getAttribute('src').replace(/.*\//, ''), f: b && getComputedStyle(b).display, vis: document.querySelector('.vd-prompt').style.display }; });
    check('lời nhắc tương tác: nút A thay chữ F', pr.shown && pr.src === 'south.webp' && pr.f === 'none' && pr.vis !== 'none', JSON.stringify(pr));
    await shot(page, 'pad-03-prompt');
    await page.evaluate(() => window.__pad.set(0, 1)); await sleep(900); await page.evaluate(() => window.__pad.set(0, 0));
    const talk = await page.waitForFunction(() => VD.lua.trace.includes('tutorial:TalkToEll_1'), null, { timeout: 8000 }).then(() => true, () => false);
    check('giữ A ở Elara → TalkToEll_1', talk);
    if (await page.evaluate(() => VD.dialog.open)) { await page.evaluate(() => window.__pad.set(1, 1)); await sleep(1300); await page.evaluate(() => window.__pad.set(1, 0)); await page.waitForFunction(() => !VD.dialog.open, null, { timeout: 30000 }).catch(() => {}); }
  } else check('tìm được Elara', false);

  // ---- 9. các bảng Gamepad: chụp từng bảng
  for (const [sec, guide, name] of [[10009, 'AttackTutorialGuidePad', 'pad-04-attack-guide'], [10009, 'FHoldTutorialGuidePad', 'pad-05-fhold-guide'],
    [10001, 'RunTutorialGuidePad', 'pad-06-run-guide'], [10001, 'ItemTutorialGuidePad', 'pad-07-item-guide']]) {
    const c = await page.evaluate(([sec, guide]) => { const g = VD.tutorial.list('gamepad').find(x => x.sector === sec && x.guide === guide); return g ? { x: g.x, z: g.z } : null; }, [sec, guide]);
    if (!c) { check('có bảng ' + guide, false); continue; }
    await page.evaluate(([x, z]) => VD.dive.debug.teleport(x, z - 1.2), [c.x, c.z]);
    await sleep(700);
    await shot(page, name);
  }

  // ---- 10. phím thật → về bàn phím (sau DEVICE_SWITCH_COOLDOWN 0,3 s)
  await sleep(400);
  await page.keyboard.press('KeyM'); await sleep(100); await page.keyboard.press('KeyM'); await sleep(200);
  d = await dev();
  const back = await page.evaluate(() => ({ kb: VD.tutorial.sets.keyboard.visible, pad: VD.tutorial.sets.gamepad.visible,
    kg: [...document.querySelectorAll('.vd-keyguide img')].map(i => i.getAttribute('src').replace(/.*\//, '')).join(','),
    skillB: getComputedStyle(document.querySelector('.vd-skill b')).display }));
  check('phím bàn phím → thiết bị Keyboard', d.input === 'keyboard' && d.body === 'keyboard', JSON.stringify(d));
  check('về bàn phím: bảng Keyboard, ảnh phím, nhãn chữ', back.kb && !back.pad && /Mouse_Left_Key/.test(back.kg) && back.skillB !== 'none', JSON.stringify(back));
  // chuột nhích < 20 px không đổi thiết bị
  await press(0); await sleep(400);
  await page.mouse.move(640, 360); await page.mouse.move(645, 362); await sleep(100);
  check('chuột nhích < 20 px không đổi sang bàn phím', (await dev()).input === 'gamepad');
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const base = process.env.VD_BASE || ('http://127.0.0.1:' + srv.address().port);
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try { await run(browser, base, errors); } catch (e) { check('chạy hết không văng', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
  const other = errors.filter(e => /^HTTP 404 .*\/(audio|art\/ui\/(portrait|dialogimage))\//.test(e) || /^console: Failed to load resource: the server responded with a status of 404/.test(e));
  const mine = errors.filter(e => other.indexOf(e) < 0);
  if (other.length) console.log('  WARN lỗi tải do module khác (' + other.length + ')');
  check('không pageerror / console error / HTTP ≥ 400', mine.length === 0, mine.slice(0, 5).join(' | '));
  await browser.close(); srv.close();
  console.log(`\n${pass} pass, ${fail} fail` + (fails.length ? '\n  hỏng: ' + fails.join('; ') : ''));
  console.log('ảnh: ' + OUT);
  process.exit(fail ? 1 : 0);
})();
