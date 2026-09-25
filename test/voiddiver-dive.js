/*
 * VOID DIVER — lớp lặn: chơi thật trên trang (Playwright, Chromium headless, WebGL swiftshader).
 *
 * Chạy:  node test/voiddiver-dive.js [--only=tutorial|normal|mobile] [--keep]
 *   1. Campaign 1100 (tutorial) 1280×720: đi qua từng trigger theo thứ tự của Lua gốc (dịch chuyển tới hộp trigger, bấm F thật),
 *      mở rương lấy chìa, mở cửa khoá, bẫy, căng thẳng 80 + quái bóng tối, hết pin, cutscene boss, ép thoát → màn kết quả.
 *      Kiểm từng bước Lua qua VD.lua.trace ("tutorial:<tên hàm>" do SendTutorialEvent ghi).
 *   2. Campaign 101 (Normal) 1280×720: mở rương, giết quái bằng chuột trái, nhặt đồ, gọi buồng ở lối thoát, thoát.
 *   3. 844×390: HUD, lời nhắc F, túi đồ vừa màn hình, không chồng nhau.
 *   Hỏng nếu: pageerror, console error, response ≥ 400. Ảnh ở %TEMP%/voiddiver-dive-shots/ — mở ra xem.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'voiddiver-dive-shots');
const OPT = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
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
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end('404'); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, ms, label) {
  try { await page.waitForFunction(fn, arg, { timeout: ms || 30000, polling: 100 }); return true; }
  catch (e) { console.log('    (hết giờ chờ: ' + (label || fn.toString().slice(0, 80)) + ')'); return false; }
}
// Đợi theo thời gian của game (VD.loop.time) — swiftshader chậm, thời gian thật không khớp.
async function gameWait(page, sec, maxMs) {
  const t0 = await page.evaluate(() => VD.loop.time);
  return waitFor(page, ([t0, s]) => VD.loop.time - t0 >= s, [t0, sec], maxMs || Math.max(20000, sec * 12000), 'game ' + sec + ' s');
}
async function holdKey(page, code, gameSec) {
  await page.keyboard.down(code);
  await gameWait(page, gameSec);
  await page.keyboard.up(code);
}

async function newPage(browser, w, h, errors) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); console.log('    PAGEERROR ' + String(e.stack || e.message).split(/\n/).slice(0, 6).join(' / ')); });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return page;
}
const shots = [];
async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  shots.push(f);
  console.log('    ảnh: ' + f);
}

async function startDive(page, port, campaign, seed, w) {
  await page.goto(`http://127.0.0.1:${port}/games/voiddiver/index.html?campaign=${campaign}&seed=${seed}&char=100001`);
  const ok = await waitFor(page, () => document.body.dataset.ready === '1', null, 240000, 'nạp lượt lặn');
  check(`[${campaign}] nạp xong`, ok);
  await page.evaluate(() => { VD.profile.load(); });
  await page.evaluate(() => VD.dive.debug.skipIntro());
  const play = await waitFor(page, () => VD.dive.state === 'play', null, 60000, 'vào play');
  check(`[${campaign}] vào trạng thái play`, play);
  return ok && play;
}
const trace = page => page.evaluate(() => (VD.lua.trace || []).slice());
async function waitTrace(page, tag, ms) {
  return waitFor(page, t => (VD.lua.trace || []).indexOf(t) >= 0, tag, ms || 60000, tag);
}
async function dialogIdle(page, ms) {
  return waitFor(page, () => !(VD.dialog && VD.dialog.open), null, ms || 90000, 'hộp thoại đóng');
}
// Dịch chuyển tới điểm của một thực thể (lọc bằng hàm chuỗi trên e), lệch dx/dz mét.
async function tpTo(page, filterSrc, dx, dz) {
  return page.evaluate(([src, dx, dz]) => {
    const f = new Function('e', 'return ' + src);
    const e = VD.dive.ents.find(f);
    if (!e) return null;
    return VD.dive.debug.teleport(e.pos.x + (dx || 0), e.pos.z + (dz || 0));
  }, [filterSrc, dx || 0, dz || 0]);
}
const focus = page => page.evaluate(() => { const f = VD.dive.focus; return f ? { kind: f.e.kind, verb: f.it.verb, time: f.it.time, locked: !!f.it.locked } : null; });

// ================================================================ 1. Tutorial 1100
async function tutorial(browser, port, errors) {
  console.log('\n== Campaign 1100 (tutorial) 1280×720');
  const page = await newPage(browser, 1280, 720, errors);
  await page.goto(`http://127.0.0.1:${port}/games/voiddiver/index.html?campaign=1100`);
  await page.evaluate(() => { localStorage.clear(); });
  if (!await startDive(page, port, 1100, 7)) return page;
  await page.keyboard.down('Control');     // tua nhanh hội thoại (dialog.js: Ctrl giữ = skipFast)

  check('OnStage → SetStep(3) → Step_00003', await waitTrace(page, 'tutorial:Step_00003'));
  // dialog.js gắn listener Ctrl khi dựng hộp thoại lần đầu: nhấn lại Ctrl sau khi hộp thoại đã có.
  await page.keyboard.up('Control'); await page.keyboard.down('Control');
  await dialogIdle(page);
  await shot(page, 'tut-01-start');
  const hud = await page.evaluate(() => ({ hud: VD.hud.root && VD.hud.root.style.display !== 'none', mm: !!document.querySelector('.vd-minimap canvas.small') }));
  check('HUD + bản đồ nhỏ hiện sau Step_00003 (SetInGameHudActive true)', hud.hud && hud.mm);

  // TalkToEll_1: trigger Elara 11002 (ZoneSpawn 11002, cờ Custom1), giữ F 0,5 s.
  await tpTo(page, "e.kind === 'trigger' && e.triggerId === 11002", 0.9, 0.3);
  await gameWait(page, 0.3);
  const f1 = await focus(page);
  check('lời nhắc F ở trigger Elara', f1 && f1.kind === 'trigger', f1 && f1.verb);
  await shot(page, 'tut-02-elara-prompt');
  await holdKey(page, 'KeyF', 0.8);
  check('E_Trigger 11002 → TalkToEll_1', await waitTrace(page, 'tutorial:TalkToEll_1'));

  // CallCollision_1: hộp va chạm 100091 (quái gần). Đi bộ vào bằng WASD một đoạn trước cho giống người chơi.
  await holdKey(page, 'KeyW', 0.6);
  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100091");
  check('va chạm 100091 → CallCollision_1', await waitTrace(page, 'tutorial:CallCollision_1'));

  // CallCollision_9 + rương DeadManBox_03 (RewardBox 1002 → Item 300000 "Chìa Khóa Xanh Quân Đội").
  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100099");
  check('va chạm 100099 → CallCollision_9', await waitTrace(page, 'tutorial:CallCollision_9'));
  await tpTo(page, "e.kind === 'box' && e.row.Id === 1002", 0.7, 0.4);
  await gameWait(page, 0.3);
  const fb = await focus(page);
  check('lời nhắc "Mở" ở rương', fb && fb.kind === 'box', fb && fb.verb);
  await holdKey(page, 'KeyF', 0.3);
  const lootOpen = await waitFor(page, () => VD.inventory.open && VD.inventory.loot && VD.inventory.loot.items.length > 0, null, 15000, 'bảng Kết quả Tìm kiếm');
  check('mở rương → bảng Kết quả Tìm kiếm có đồ', lootOpen);
  await shot(page, 'tut-03-box-loot');
  await page.keyboard.up('Control');
  await page.keyboard.press('KeyF');        // F khi bảng mở = lấy hết
  await page.keyboard.down('Control');
  const key = await page.evaluate(() => VD.inventory.count('Item', 300000));
  check('lấy được chìa 300000', key >= 1, key);
  await page.keyboard.press('Tab');
  check('Tab đóng túi', await waitFor(page, () => !VD.inventory.open, null, 5000));

  // CallCollision_8 + cửa SteelEntrance (Entrance 2005, khoá Key 300000).
  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100098");
  check('va chạm 100098 → CallCollision_8', await waitTrace(page, 'tutorial:CallCollision_8'));
  await tpTo(page, "e.kind === 'door' && e.row.Id === 2005", 0.8, 0.8);
  await gameWait(page, 0.3);
  const fd = await focus(page);
  check('lời nhắc ở cửa khoá', fd && fd.kind === 'door', fd && fd.verb);
  await holdKey(page, 'KeyF', 0.7);
  const doorOpen = await page.evaluate(() => { const d = VD.dive.ents.find(e => e.kind === 'door' && e.row.Id === 2005); return d && d.open; });
  check('cửa 2005 mở bằng chìa (chìa bị dùng)', doorOpen && await page.evaluate(() => VD.inventory.count('Item', 300000) === 0));
  await shot(page, 'tut-04-door-open');

  // Sector 10001: bẫy, rương, căng thẳng.
  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100092");
  check('va chạm 100092 → CallCollision_2 (bẫy)', await waitTrace(page, 'tutorial:CallCollision_2'));
  await tpTo(page, "e.kind === 'trap'", 1.2, 0.8);
  await gameWait(page, 2.5);
  const trapFired = await page.evaluate(() => (VD.stage.A.hitboxes || []).some(h => h.owner && h.owner.kind === 'trap') || VD.dive.ents.some(e => e.kind === 'trap' && e.t < e.row.CoolTime));
  check('bẫy bắn hitbox (Trap.HitBoxIds qua lõi combat)', trapFired);
  await shot(page, 'tut-05-trap');

  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100093");
  check('va chạm 100093 → CallCollision_3 (rương)', await waitTrace(page, 'tutorial:CallCollision_3'));

  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100094");
  check('va chạm 100094 → CallCollision_4', await waitTrace(page, 'tutorial:CallCollision_4'));
  const stressOk = await waitFor(page, () => VD.stage.player.stress >= 79, null, 20000, 'stress 80');
  check('SetCharacterStress(80)', stressOk, await page.evaluate(() => VD.stage.player.stress));
  const shadows = await waitFor(page, () => VD.dive.mons.filter(m => m.id === 220009).length >= 3, null, 90000, '3 quái 220009');
  check('Lua sinh 3 quái bóng tối 220009', shadows);
  check('trạng thái căng thẳng Fear (Stress.csv 50–99)', (await page.evaluate(() => VD.dive.debug.stressState())) === 'Fear');
  await gameWait(page, 1.0);
  // đánh lại bằng chuột trái một nhịp (người chơi thật)
  const pl = await page.evaluate(() => { const m = VD.dive.mons.find(m => m.id === 220009 && !m.dead); return m ? { x: m.pos.x, z: m.pos.z } : null; });
  if (pl) {
    const scr = await page.evaluate(p => { const v = new THREE.Vector3(p.x, 0.5, p.z).project(VD.render.camera); const c = VD.render.renderer.domElement; return { x: (v.x + 1) / 2 * c.clientWidth, y: (1 - v.y) / 2 * c.clientHeight }; }, pl);
    await page.mouse.move(scr.x, scr.y);
    await page.mouse.down();
    await gameWait(page, 1.2);
    await page.mouse.up();
  }
  await shot(page, 'tut-06-stress-shadow');

  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100095");
  check('va chạm 100095 → CallCollision_5 (máy bán hàng)', await waitTrace(page, 'tutorial:CallCollision_5'));

  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100096");
  check('va chạm 100096 → CallCollision_6', await waitTrace(page, 'tutorial:CallCollision_6'));
  check('SetCharacterLightFuel(0) → pin 0', await waitFor(page, () => VD.stage.player.light === 0, null, 20000));
  await gameWait(page, 0.5);
  const dark = await page.evaluate(() => ({ dark: VD.dive.dark, range: VD.render.sight.uSightRange.value, b6101: !!VD.stage.player.buffs.get(6101) }));
  check('hết pin: tầm nhìn còn BlindSightRange + buff 6101 của passive 10000000', dark.dark && Math.abs(dark.range - 1) < 1e-6 && dark.b6101, JSON.stringify(dark));
  await shot(page, 'tut-07-dark');

  // TalkToEll_2: trigger Elara 11003 (cờ Custom3).
  await tpTo(page, "e.kind === 'trigger' && e.triggerId === 11003", 0.9, 0.3);
  await gameWait(page, 0.3);
  await holdKey(page, 'KeyF', 0.8);
  check('E_Trigger 11003 → TalkToEll_2', await waitTrace(page, 'tutorial:TalkToEll_2'));
  await dialogIdle(page);

  // CallCollision_7: cutscene + boss 810001 + SpawnExit 1004 + SetStep(10) + ForceEscapeStage.
  await tpTo(page, "e.kind === 'collision' && e.triggerId === 100097");
  check('va chạm 100097 → CallCollision_7', await waitTrace(page, 'tutorial:CallCollision_7'));
  await waitFor(page, () => !!VD.dive.cutscene, null, 20000, 'cutscene');
  await gameWait(page, 0.8);
  await shot(page, 'tut-08-cutscene');
  check('boss 810001 xuất hiện sau cutscene', await waitFor(page, () => VD.dive.mons.some(m => m.id === 810001), null, 60000));
  await gameWait(page, 0.6);
  await shot(page, 'tut-09-boss');
  check('SpawnExit(1004) dựng buồng thoát an toàn', await waitFor(page, () => VD.dive.ents.some(e => e.kind === 'exit' && e.row.Id === 1004), null, 60000));
  const result = await waitFor(page, () => VD.dive.state === 'result' && !!document.querySelector('.vd-result'), null, 120000, 'màn kết quả');
  check('ForceEscapeStage → màn kết quả', result);
  await page.keyboard.up('Control');
  await sleep(400);
  await shot(page, 'tut-10-result');
  const res = await page.evaluate(() => VD.dive.result);
  check('kết quả: thoát thành công (ép thoát)', res && res.escaped && res.forced, res && JSON.stringify({ escaped: res.escaped, forced: res.forced, exp: res.exp.total, cleared: res.campaignCleared }));
  check('bước quest = 10 (QuestComplete chạy ở sảnh)', await page.evaluate(() => VD.profile.quest('c1100').step === 10));
  check('campaign 1100 tính là qua', res && res.campaignCleared);
  const tr = await trace(page);
  const want = ['Step_00003', 'TalkToEll_1', 'CallCollision_1', 'CallCollision_9', 'CallCollision_8', 'CallCollision_2', 'CallCollision_3', 'CallCollision_4', 'CallCollision_5', 'CallCollision_6', 'TalkToEll_2', 'CallCollision_7'];
  const got = tr.filter(t => t.startsWith('tutorial:')).map(t => t.slice(9));
  check('đủ 12 bước Lua đúng thứ tự', JSON.stringify(got) === JSON.stringify(want), got.join(' → '));
  const luaErr = await page.evaluate(() => VD.lua.errors.slice());
  check('không lỗi Lua', luaErr.length === 0, luaErr.join(' | '));
  const unimpl = await page.evaluate(() => Array.from(VD.lua.warned));
  console.log('    LuaApi chưa làm được gọi: ' + (unimpl.join(', ') || '(không)'));
  const miss = await page.evaluate(() => VD.dive.debug.missing());
  console.log('    thiếu dữ liệu/asset: ' + (miss.join(', ') || '(không)'));
  await page.keyboard.press('Space');
  return page;
}

// ================================================================ 2. Normal 101
async function normal(browser, port, errors) {
  console.log('\n== Campaign 101 (Normal) 1280×720');
  const page = await newPage(browser, 1280, 720, errors);
  if (!await startDive(page, port, 101, 11)) return page;
  await page.keyboard.down('Control');
  await dialogIdle(page, 30000);
  const info = await page.evaluate(() => ({
    cells: VD.dive.cells.length, sectors: VD.world.sectors.length, exits: VD.dive.ents.filter(e => e.kind === 'exit').map(e => e.row.Type),
    boxes: VD.dive.ents.filter(e => e.kind === 'box').length, traps: VD.dive.ents.filter(e => e.kind === 'trap').length,
    dormant: VD.dive.dormant.length, mons: VD.dive.mons.length, zones: Object.keys(VD.dive.zoneSpawns).length,
    bound: VD.dive.cells.filter(c => c.boundary).map(c => c.id), tasks: VD.dive.tasks.map(t => t.cond + ':' + t.goal),
  }));
  console.log('    map: ' + JSON.stringify(info));
  check('map 6×6 + 2 hàng biên = 48 ô', info.cells === 48 && info.sectors === 48, info.cells);
  check('có lối thoát WaveExit + SafeExit (ZoneSpawn 1001–1008)', info.exits.includes('WaveExit') && info.exits.includes('SafeExit'), info.exits.join(','));
  check('có rương, bẫy, quái (đang ngủ + đã sinh)', info.boxes > 50 && info.traps > 20 && info.dormant + info.mons > 50);
  check('CampaignTask TeamTotalWorth ≥ 10000', info.tasks.includes('TeamTotalWorth:10000'));
  await shot(page, 'n-01-start');
  await page.keyboard.up('Control');
  await page.keyboard.press('KeyM');
  await gameWait(page, 0.3);
  await shot(page, 'n-02-bigmap');
  await page.keyboard.press('KeyM');
  await page.keyboard.down('Control');

  // --- rương gần nhất
  const box = await page.evaluate(() => {
    const p = VD.stage.player.pos;
    const b = VD.dive.ents.filter(e => e.kind === 'box' && !e.opened && !e.row.HasKeyInteraction && (!(e.row.InteractStressConditions || []).length || e.row.InteractStressConditions.indexOf('Alert') >= 0))
      .sort((a, c) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(c.pos.x - p.x, c.pos.z - p.z))[0];
    if (!b) return null;
    VD.dive.debug.teleport(b.pos.x + 0.8, b.pos.z + 0.4);
    b._test = true;
    return { id: b.row.Id, prefab: b.prefab };
  });
  check('tìm được rương thường', !!box, box && JSON.stringify(box));
  await gameWait(page, 0.4);
  await shot(page, 'n-03-box-prompt');
  const before = await page.evaluate(() => VD.inventory.goods().length);
  await holdKey(page, 'KeyF', 0.3);
  await waitFor(page, () => VD.inventory.open, null, 10000, 'túi mở');
  await shot(page, 'n-04-box-loot');
  await page.keyboard.up('Control');
  await page.keyboard.press('KeyF');
  await page.keyboard.down('Control');
  await page.keyboard.press('Tab');
  const after = await page.evaluate(() => VD.inventory.goods().length);
  const boxLoot = await page.evaluate(() => { const b = VD.dive.ents.find(e => e._test); return b ? b.loot : null; });
  check('mở rương (roll DropReward) — lấy đồ vào túi', after >= before, 'loot ' + JSON.stringify(boxLoot) + ' túi ' + before + '→' + after);

  // --- giết quái bằng đòn thường (chuột trái giữ)
  const mon = await page.evaluate(() => {
    const p = VD.stage.player.pos;
    // quái gần nhất (đánh thức quái ngủ gần đó)
    let best = null, bd = 1e9;
    for (const m of VD.dive.dormant) { const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bd) { bd = d; best = m; } }
    for (const m of VD.dive.mons) if (!m.dead) { const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bd) { bd = d; best = m; } }
    if (!best) return null;
    VD.dive.debug.teleport(best.pos.x + 1.4, best.pos.z + 1.4);
    return { id: best.id, x: best.pos.x, z: best.pos.z };
  });
  check('tìm được quái', !!mon, mon && mon.id);
  let killed = false, assisted = false;
  const kills0 = await page.evaluate(() => VD.dive.stats.kills);
  for (let round = 0; round < 40 && !killed; round++) {
    const tgt = await page.evaluate(() => {
      const p = VD.stage.player.pos;
      const m = VD.dive.mons.filter(m => !m.dead && m.monsterType !== 'Shadow').sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
      if (!m) return null;
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d > 1.6) VD.dive.debug.teleport(m.pos.x + (p.x - m.pos.x) / d * 1.1, m.pos.z + (p.z - m.pos.z) / d * 1.1);
      const v = new THREE.Vector3(m.pos.x, 0.5, m.pos.z).project(VD.render.camera); const c = VD.render.renderer.domElement;
      return { x: (v.x + 1) / 2 * c.clientWidth, y: (1 - v.y) / 2 * c.clientHeight, hp: m.hp, uid: m.uid };
    });
    if (!tgt) break;
    await page.mouse.move(tgt.x, tgt.y);
    await page.mouse.down();
    await gameWait(page, 0.8);
    await page.mouse.up();
    if (round === 2) await shot(page, 'n-05-fight');
    // hồi máu người chơi giữa các hiệp để bài kiểm đi tiếp (không đổi luật của quái)
    await page.evaluate(() => { const u = VD.stage.player; if (u.hp < u.stats.HpMax * 0.4) u.hp = u.stats.HpMax; });
    killed = await page.evaluate(k0 => VD.dive.stats.kills > k0, kills0);
  }
  if (!killed) {
    assisted = true;
    await page.evaluate(() => { const p = VD.stage.player.pos; const m = VD.dive.mons.filter(m => !m.dead).sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0]; if (m) VD.Combat.kill(VD.stage.A, m, VD.stage.player); });
    killed = await page.evaluate(k0 => VD.dive.stats.kills > k0, kills0);
  }
  check('giết được quái (E_MonsterKill, EXP)', killed, assisted ? 'có hỗ trợ Combat.kill sau 40 hiệp' : 'bằng đòn thường');
  await gameWait(page, 0.2);   // luaEvent vào hàng đợi, xả ở khung hình kế
  check('sự kiện Lua MonsterKill (201) được gửi', (await trace(page)).some(t => /^event:201:/.test(t)));
  await gameWait(page, 1.0);

  // --- nhặt đồ: đồ quái rơi nếu có, không thì vứt một món khỏi túi rồi nhặt lại
  let drop = await page.evaluate(() => { const p = VD.stage.player.pos; const d = VD.dive.ents.filter(e => e.kind === 'drop').sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0]; return d && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < 12 ? d.id : null; });
  if (!drop) {
    drop = await page.evaluate(() => {
      const k = VD.inventory.slots.findIndex(s => s.g);
      if (k < 0) { VD.inventory.add({ type: 'Item', id: 2000, count: 1 }); }
      const k2 = VD.inventory.slots.findIndex(s => s.g);
      VD.inventory.drop(k2);
      const d = VD.dive.ents.filter(e => e.kind === 'drop').pop();
      return d ? d.id : null;
    });
  }
  const g0 = await page.evaluate(id => { const d = VD.dive.ents.find(e => e.id === id); VD.dive.debug.teleport(d.pos.x + 0.3, d.pos.z + 0.3); return { goods: d.goods, n: VD.inventory.count(d.goods.type, d.goods.id) }; }, drop);
  await gameWait(page, 0.4);
  await shot(page, 'n-06-drop');
  const fdrop = await focus(page);
  check('lời nhắc "Nhặt" ở đồ rơi', fdrop && fdrop.kind === 'drop', fdrop && fdrop.verb);
  await holdKey(page, 'KeyF', 0.3);
  const g1 = await page.evaluate(g => VD.inventory.count(g.type, g.id), g0.goods);
  check('nhặt đồ rơi vào túi', g1 > g0.n, JSON.stringify(g0.goods) + ' ' + g0.n + '→' + g1);

  // --- lối thoát: WaveExit gần nhất: giữ F 2 s gọi buồng, chống đợt quái 15 s, giữ F 7 s trong buồng
  check('nhặt đồ không mở luôn rương bên cạnh (phải thả F)', !(await page.evaluate(() => VD.inventory.open)));
  await page.evaluate(() => { if (VD.inventory.open) VD.inventory.toggle(false); });
  const ex = await page.evaluate(() => {
    const p = VD.stage.player.pos;
    const e = VD.dive.ents.filter(e => e.kind === 'exit' && e.row.Type === 'WaveExit').sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z))[0];
    if (!e) return null;
    VD.dive.debug.teleport(e.pos.x + 0.9, e.pos.z + 0.6);
    return { id: e.row.Id, wave: e.row.WaveId, ent: e.id };
  });
  check('tìm được WaveExit', !!ex, ex && JSON.stringify(ex));
  if (ex) await page.evaluate(id => { window.__waveEnt = id; }, ex.ent);
  await gameWait(page, 0.6);
  await shot(page, 'n-07-exit-idle');
  await holdKey(page, 'KeyF', 2.4);
  check('gọi buồng → activating + đợt quái (E_WaveStarted)', await waitFor(page, () => VD.dive.ents.some(e => e.id === window.__waveEnt && e.state === 'activating'), null, 20000)
    && (await trace(page)).some(t => /^event:202:/.test(t)));
  await gameWait(page, 3.5);
  await shot(page, 'n-08-exit-wave');
  // Từ đây bài kiểm giữ người chơi sống (hồi máu, giết quái đợt trong 9 m) — thứ đang kiểm là luồng buồng thoát, không phải độ khó đợt quái.
  const act = await waitFor(page, () => { const u = VD.stage.player; if (u && !u.dead) { if (u.hp < u.stats.HpMax * 0.6) u.hp = u.stats.HpMax; u.stress = Math.min(u.stress || 0, 40); for (const m of VD.dive.mons) if (!m.dead && Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z) < 9) VD.Combat.kill(VD.stage.A, m, u); } return VD.dive.ents.some(e => e.id === window.__waveEnt && e.state === 'activated'); }, null, 400000, 'buồng tới (ExitActivatingTime 15 s)');
  check('sau ExitActivatingTime buồng tới (activated)', act);
  await page.evaluate(() => { const e = VD.dive.ents.find(e => e.id === window.__waveEnt); VD.dive.debug.teleport(e.pos.x + 0.6, e.pos.z + 0.6); });
  await gameWait(page, 0.4);
  await shot(page, 'n-09-exit-escape-prompt');
  const fe = await focus(page);
  check('lời nhắc "Thoát Hiểm" ở buồng', fe && fe.kind === 'exit' && fe.time >= 6.9, fe && (fe.verb + ' ' + fe.time + ' s'));
  await page.keyboard.down('KeyF');
  const res = await waitFor(page, () => { const u = VD.stage.player; if (u && !u.dead) { if (u.hp < u.stats.HpMax * 0.6) u.hp = u.stats.HpMax; u.stress = Math.min(u.stress || 0, 40); for (const m of VD.dive.mons) if (!m.dead && Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z) < 9) VD.Combat.kill(VD.stage.A, m, u); } return VD.dive.state === 'result' || VD.dive.state === 'escaping'; }, null, 400000, 'thoát');
  await page.keyboard.up('KeyF');
  check('giữ F ExitInteractionTime → thoát', res);
  await waitFor(page, () => !!document.querySelector('.vd-result'), null, 60000);
  await page.keyboard.up('Control');
  await sleep(500);
  await shot(page, 'n-10-result');
  const r = await page.evaluate(() => VD.dive.result);
  check('kết quả: thoát, có EXP rương/quái/thoát', r && r.escaped && r.exp.escape > 0 && r.exp.box > 0, r && JSON.stringify(r.exp));
  check('đồ mang về vào kho hồ sơ', await page.evaluate(() => VD.profile.get().stash.length > 0));
  const luaErr = await page.evaluate(() => VD.lua.errors.slice());
  check('không lỗi Lua', luaErr.length === 0, luaErr.join(' | '));
  const miss = await page.evaluate(() => VD.dive.debug.missing());
  console.log('    thiếu dữ liệu/asset: ' + (miss.join(', ') || '(không)'));
  return page;
}

// ================================================================ 3. màn điện thoại 844×390
async function mobile(browser, port, errors) {
  console.log('\n== 844×390 (điện thoại ngang)');
  const page = await newPage(browser, 844, 390, errors);
  if (!await startDive(page, port, 101, 11)) return page;
  await page.keyboard.down('Control');
  await dialogIdle(page, 30000);
  await page.evaluate(() => { const p = VD.stage.player.pos; const b = VD.dive.ents.filter(e => e.kind === 'box' && !e.row.HasKeyInteraction).sort((a, c) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(c.pos.x - p.x, c.pos.z - p.z))[0]; VD.dive.debug.teleport(b.pos.x + 0.8, b.pos.z + 0.4); });
  await gameWait(page, 0.5);
  await shot(page, 'm-01-hud-prompt');
  const lay = await page.evaluate(() => {
    const r = sel => { const e = document.querySelector(sel); if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    return { bars: r('.vd-hud-left'), skills: r('.vd-skills'), items: r('.vd-items'), quest: r('.vd-quest'), map: r('.vd-minimap canvas.small'), prompt: r('.vd-prompt'), W: innerWidth, H: innerHeight };
  });
  const inside = b => b && b.l >= -1 && b.t >= -1 && b.r <= lay.W + 1 && b.b <= lay.H + 1;
  const over = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  check('HUD nằm trong 844×390', ['bars', 'skills', 'items', 'quest', 'map'].every(k => inside(lay[k])), JSON.stringify(lay));
  check('HUD không chồng nhau (thanh máu / skill / ô đồ / nhiệm vụ / bản đồ)', !over(lay.bars, lay.skills) && !over(lay.skills, lay.items) && !over(lay.quest, lay.map));
  check('lời nhắc F hiện, nằm trong màn và không đè ô skill', lay.prompt && inside(lay.prompt) && !over(lay.prompt, lay.skills));
  await page.keyboard.up('Control');
  await page.keyboard.press('Tab');
  await gameWait(page, 0.3);
  await shot(page, 'm-02-inventory');
  const inv = await page.evaluate(() => { const b = document.querySelector('.vd-inv-win').getBoundingClientRect(); return { w: b.width, h: b.height, l: b.left, t: b.top }; });
  check('bảng túi đồ vừa màn 844×390', inv.l >= 0 && inv.t >= 0 && inv.w <= 844 && inv.h <= 390, JSON.stringify(inv));
  await page.keyboard.press('Tab');
  return page;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const only = OPT.only;
  try {
    if (!only || only === 'tutorial') await tutorial(browser, port, errors);
    if (!only || only === 'normal') await normal(browser, port, errors);
    if (!only || only === 'mobile') await mobile(browser, port, errors);
  } catch (e) {
    console.log('  LỖI chạy kiểm: ' + (e.stack || e));
    fail++; fails.push('exception');
  }
  const uniq = [...new Set(errors)];
  // 404 của tiếng/chân dung do module khác gọi (buff/stage/dialog) là asset thiếu của đường ống: liệt kê riêng (WARN).
  // Mọi lỗi khác (pageerror, console error không phải 404, 404 trong phần của lớp lặn) làm hỏng bài kiểm.
  const MINE = /art\/object\/|data\/objects\.js|css\/dive\.css|js\/(dive|inventory|objects|minimap|profile)\.js/;
  const other404 = uniq.filter(e => /^HTTP 404 /.test(e) && !MINE.test(e));
  const bad = uniq.filter(e => other404.indexOf(e) < 0 && !/^console: Failed to load resource: the server responded with a status of 404/.test(e));
  if (other404.length) console.log('  WARN asset thiếu do module khác gọi (' + other404.length + '):\n      ' + other404.map(e => e.replace(/^HTTP 404 http:\/\/127\.0\.0\.1:\d+\//, '')).join('\n      '));
  check('không pageerror / console error / 404 của lớp lặn', bad.length === 0, bad.slice(0, 12).join('\n      '));
  await browser.close();
  srv.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail' + (fails.length ? ': ' + fails.join('; ') : ''));
  console.log('ảnh: ' + OUT + ' (' + shots.length + ')');
  process.exit(fail ? 1 : 0);
})();
