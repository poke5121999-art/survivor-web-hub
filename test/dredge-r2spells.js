/*
 * DREDGE — Biển Mù: kiểm ba phép Xua đuổi / Teo tàn / Hiện thân (round 2b, r2spells) trên trang thật (Playwright), điều khiển bằng
 * chuột/bàn phím thật; móc nội bộ chỉ để mở khoá, dựng tình huống và đọc số.
 *
 * Chạy:  node test/dredge-r2spells.js     Ảnh: %TEMP%/dredge-r2spells/ (1920x1080 và 844x390)
 * Số mong đợi lấy từ bản gốc:
 *   AbilityData: banish duration 15, cooldown 0,5 ngày, castTime 0; atrophy castTime 1, cooldown 0,5, canFailCast;
 *     manifest castTime 1, cooldown 0,5.
 *   BanishAbility: sanityLossOnActivate −0,25, animationEndDuration 1. AtrophyAbility: radius 50, sanityLossOnActivate −0,25.
 *   GameConfig: atrophyStockPenalty −10, atrophyGuaranteedAberrationCount 1, atrophyConditionMin/Max 0,75 / 1,5.
 *   TeleportAbility: sanityChange −0,4; PlayerTeleport preHold 1 s, hold 0,5 s; TeleportDestination (Game.unity) = (80, 0, −100).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'dredge-r2spells');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };
let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) { if (ok) pass++; else fail++; out.push((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : '')); }
const near = (a, b, e) => Math.abs(a - b) <= e;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream', 'Content-Length': b.length }); r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}
const wedgePoint = (W, H, i, n) => { const a = (360 / n * i) * Math.PI / 180, r = 200 * (H / 1080); return [W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r]; };
async function boot(page, base, q) {
  await page.goto(base + '/games/dredge/index.html?' + q);
  await page.waitForFunction(() => window.DR_DEBUG && DR_DEBUG.ready(), null, { timeout: 180000 });
  await page.click('#btn-new');
  await page.waitForFunction(() => DR.mode === 'dock', null, { timeout: 15000 });
  await page.evaluate(() => DR.setMode('sail'));
  await page.waitForFunction(() => DR.mode === 'sail' && !DR_DEBUG.info().auto, null, { timeout: 20000 });
  await sleep(500);
}
// chọn năng lực qua vòng chọn (giữ E, rê chuột tới nêm, thả E)
async function pick(page, W, H, idx) {
  const p = wedgePoint(W, H, idx, 11);
  await page.keyboard.down('KeyE'); await sleep(450);
  await page.mouse.move(p[0], p[1], { steps: 4 }); await sleep(150);
  await page.keyboard.up('KeyE'); await sleep(250);
}
const right = async (page, ms) => { await page.mouse.down({ button: 'right' }); await sleep(ms); await page.mouse.up({ button: 'right' }); await sleep(120); };
const OPEN = () => {
  for (let r = 0; r < 400; r += 20) for (let a = 0; a < 6.283; a += 0.5236) {
    const x = 20 + Math.cos(a) * r, z = -30 + Math.sin(a) * r;
    if (DR_DEBUG.sdf(x, z) > 40) return { x, z, yaw: 0.3 };
  }
  return { x: 20, z: -30, yaw: 0.3 };
};

async function run(browser, base, W, H, tag) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const shot = n => page.screenshot({ path: path.join(SHOTS, W + 'x' + H + '-' + n + '.png') });
  const ab = () => page.evaluate(() => DRAbilities.debug());
  await boot(page, base, 'fresh=1&t=0.42');
  const ow = await page.evaluate(OPEN);
  await page.evaluate(o => { DR_DEBUG.teleport(o.x, o.z, o.yaw); DR.s.vars['can-catch-aberrations'] = true; }, ow);
  await page.mouse.click(W / 2, H / 2 + 300); await sleep(300);
  const un = await page.evaluate(() => DR_DEBUG.unlockSpells());
  check('DR_DEBUG.unlockSpells mở cả ba', un.every(Boolean) && await page.evaluate(() => ['banish', 'atrophy', 'manifest'].every(i => DR.s.abilities[i])), JSON.stringify(un));

  // ------------------------------------------------------------------ Xua đuổi
  await pick(page, W, H, 8);
  check('chọn banish qua vòng (nêm 8)', (await ab()).selected === 'banish');
  await page.evaluate(() => { DR.s.sanity = 1; });
  await right(page, 80);
  let d = await page.evaluate(() => ({ b: DRSpells.banished, san: DR.s.sanity, fx: DRParticles.effects.filter(e => e.name === 'BanishEffect' && e.alive).length }));
  check('chuột phải: cờ Xua đuổi bật', d.b === true, JSON.stringify(d));
  check('sanity 1 → 0,75 (sanityLossOnActivate −0,25)', near(d.san, 0.75, 0.03), d.san.toFixed(3));
  check('BanishEffect đang chạy quanh thuyền', d.fx === 1, 'số hiệu ứng = ' + d.fx);
  await sleep(1200);
  await shot(tag + '-banish');
  await sleep(11500);
  check('sau ~13 s: vẫn bật', await page.evaluate(() => DRSpells.banished));
  await sleep(3200);
  d = await page.evaluate(() => ({ b: DRSpells.banished, ph: DR_DEBUG.spells().banish }));
  check('sau ~16,5 s (15 s + animationEndDuration 1 s): cờ tắt', d.b === false, JSON.stringify(d));
  const c0 = (await ab()).casts;
  await right(page, 80);
  check('còn hồi chiêu (cần 0,5 ngày): dùng lại không được', (await ab()).casts === c0 && !(await page.evaluate(() => DRSpells.banished)));
  await page.evaluate(() => { DR.s.time += 0.51; });
  await right(page, 80);
  check('qua 0,51 ngày: dùng lại được, cờ bật', (await ab()).casts === c0 + 1 && await page.evaluate(() => DRSpells.banished));

  // ------------------------------------------------------------------ Hiện thân
  await pick(page, W, H, 9);
  check('chọn manifest qua vòng (nêm 9)', (await ab()).selected === 'manifest');
  await page.evaluate(() => { DR.s.sanity = 1; });
  const ok1 = await page.evaluate(() => DR_DEBUG.sdf(80, -100));
  check('đích (80, -100) là mặt nước', ok1 > 0, 'sdf = ' + ok1);
  await page.mouse.down({ button: 'right' }); await sleep(600);
  check('giữ 0,6 s (< castTime 1 s): chưa dịch chuyển', !(await page.evaluate(() => DRSpells.busy)));
  await sleep(650);
  await page.mouse.up({ button: 'right' }); await sleep(150);
  d = await page.evaluate(() => ({ busy: DRSpells.busy, vis: DRBoat.root.visible, blocked: DRBoat.blocked, fx: DRParticles.effects.filter(e => e.name === 'TeleportEffect' && e.alive).length }));
  check('giữ đủ 1 s: bắt đầu dịch chuyển, thân thuyền ẩn, khoá lái, TeleportEffect chạy', d.busy && !d.vis && d.blocked && d.fx === 1, JSON.stringify(d));
  await shot(tag + '-manifest-pre');
  await sleep(1100);
  d = await page.evaluate(() => ({ info: DR_DEBUG.info() }));
  check('sau preHold 1 s: thuyền ở TeleportDestination (80, −100)', near(d.info.x, 80, 0.5) && near(d.info.z, -100, 0.5), d.info.x.toFixed(2) + ',' + d.info.z.toFixed(2));
  check('sanity 1 → 0,6 (sanityChange −0,4)', near(d.info.sanity, 0.6, 0.03), d.info.sanity.toFixed(3));
  await sleep(900);
  d = await page.evaluate(() => ({ busy: DRSpells.busy, vis: DRBoat.root.visible, blocked: DRBoat.blocked }));
  check('sau holdTime 0,5 s: thuyền hiện lại, trả điều khiển', !d.busy && d.vis && !d.blocked, JSON.stringify(d));
  await shot(tag + '-manifest-post');
  const c1 = (await ab()).casts;
  await page.mouse.down({ button: 'right' }); await sleep(1200); await page.mouse.up({ button: 'right' }); await sleep(200);
  check('còn hồi chiêu: không dịch chuyển lần hai', (await ab()).casts === c1 && !(await page.evaluate(() => DRSpells.busy)));

  // ------------------------------------------------------------------ Teo tàn
  const empty = await page.evaluate(() => {   // mặt nước cách mọi điểm câu > 80 m
    for (let r = 0; r < 900; r += 25) for (let a = 0; a < 6.283; a += 0.3) {
      const x = 20 + Math.cos(a) * r, z = -30 + Math.sin(a) * r;
      if (DR_DEBUG.sdf(x, z) > 30 && DRSpots.list.every(p => Math.hypot(p.x - x, p.z - z) > 80)) return { x, z, yaw: 0.3 };
    }
    return null;
  });
  check('có chỗ nước trống cách mọi điểm câu > 80 m', !!empty, JSON.stringify(empty));
  await page.evaluate(o => { DR_DEBUG.teleport(o.x, o.z, o.yaw); }, empty);
  await pick(page, W, H, 7);
  check('chọn atrophy qua vòng (nêm 7)', (await ab()).selected === 'atrophy');
  const far = await page.evaluate(() => { const t = DRSpells.target(); return t ? t.sp.id : null; });
  await page.mouse.down({ button: 'right' }); await sleep(1250); await page.mouse.up({ button: 'right' }); await sleep(300);
  check('không có điểm cá trong 50 m: không mở bảng, không ghi hồi chiêu', far === null && !(await page.evaluate(() => DRCargo.isOpen())) && !(await page.evaluate(() => DR.s.abilityHistory.atrophy)), 'target=' + far);
  // dựng tình huống: điểm cá có dị biến, kho đầy, thuyền đứng cách 30 m
  await page.evaluate(() => {
    DR.s.hullTier = 4; DR.resetGrid('INVENTORY', DR_CONFIG.hullTierGridConfigs[3]); DRBoat.setTier(4); DRBoat.refresh();
    DR.s.time = Math.floor(DR.s.time) + 0.42 + 1;                                                   // hồi chiêu đã qua, ban ngày
  });
  const sp = await page.evaluate(() => DRSpells.spotsForTest().find(x => { const p = DRSpots.byId[x.id], q = { x: p.x + 30, z: p.z }; return x.fish && DR_DEBUG.sdf(q.x, q.z) > 5 && DRSpots.list.every(o => o === p || Math.hypot(o.x - q.x, o.z - q.z) > 32); }));
  check('tìm được điểm cá ban ngày có dị biến để thử', !!sp, JSON.stringify(sp));
  sp.max = await page.evaluate(id => DRSpots.byId[id].d.maxStock, sp.id);
  await page.evaluate(s => {
    const p = DRSpots.byId[s.id], r = DRSpots.rec(p); r.stock = p.d.maxStock; r.lastUpdate = DR.s.time;
    DR_DEBUG.teleport(p.x + 30, p.z, 0);
  }, sp);
  await sleep(500);
  d = await page.evaluate(() => { const t = DRSpells.target(); return t && { id: t.sp.id, dist: t.dist }; });
  check('có mục tiêu trong 50 m, là điểm gần nhất', d && d.id === sp.id && near(d.dist, 30, 1), JSON.stringify(d));
  await page.evaluate(() => { DR.s.sanity = 1; });
  await page.mouse.down({ button: 'right' }); await sleep(1250); await page.mouse.up({ button: 'right' }); await sleep(1500);
  d = await page.evaluate(id => ({
    open: DRCargo.isOpen(), stock: DRSpots.rec(DRSpots.byId[id]).stock, san: DR.s.sanity, g: DRSpells.grid(),
    fx: DRParticles.effects.filter(e => /^Atrophy/.test(e.name) && e.alive).length
  }), sp.id);
  check('bảng Teo tàn mở (chế độ cargo)', d.open);
  check('kho điểm = atrophyStockPenalty −10', d.stock === -10, String(d.stock));
  check('sanity 1 → 0,75 (−0,25)', near(d.san, 0.75, 0.03), d.san.toFixed(3));
  check('AtrophyPlayerEffect + AtrophyFishEffect đang chạy', d.fx === 2, String(d.fx));
  check('tạo đúng floor(kho) = maxStock con cá, ≥ 1 dị biến, đặt được vào lưới 6x6 (con không vừa thì mất như bản gốc), độ tươi trong [0,75; 1,5]', d.g && d.g.made === sp.max && d.g.n >= 1 && d.g.n <= d.g.made && d.g.aberrant >= 1 && d.g.fresh.every(f => f >= 0.75 && f <= 1.5), JSON.stringify(d.g));
  await shot(tag + '-atrophy');
  const inv0 = await page.evaluate(() => DR.grid('INVENTORY').items.length), n0 = d.g.n;
  const btn = await page.$('.cg-foot [data-act="atrophy-take-all"]');
  check('có nút "Lấy hết"', !!btn);
  if (btn) { await btn.click(); await sleep(600); }
  d = await page.evaluate(() => ({ inv: DR.grid('INVENTORY').items.length, open: DRCargo.isOpen(), busy: DRSpells.busy, mode: DR.mode }));
  check('"Lấy hết": mọi con trong lưới vào khoang, bảng đóng, về lái thuyền', d.inv === inv0 + n0 && !d.open && !d.busy && d.mode === 'sail', JSON.stringify(d));
  const left = await page.evaluate(() => DRParticles.effects.filter(e => /^Atrophy/.test(e.name) && e.alive && !e.stopped).length);
  check('hiệu ứng Teo tàn đã ngừng phát (hạt còn lại tự tan)', left === 0, String(left));
  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  let srv = null, base = process.env.DR_URL;
  if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port; }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  console.log('DREDGE r2spells — ' + base);
  try {
    out.push('\n[1920x1080]'); await run(browser, base, 1920, 1080, 'a');
    out.push('\n[844x390]'); await run(browser, base, 844, 390, 'p');
  } catch (e) { check('chạy hết kịch bản', false, e.stack || e.message); }
  await browser.close(); if (srv) srv.close();
  console.log(out.join('\n')); console.log('\nẢnh: ' + SHOTS); console.log(pass + ' đạt, ' + fail + ' trượt');
  process.exit(fail ? 1 : 0);
})();
