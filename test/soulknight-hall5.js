/*
 * Sảnh đợt 5 (games/soulknight/js/hall5.js, hall.js, hall_use.js): Máy Đổi và Máy Game vẽ bằng prefab gốc (tools/extra/hall5.json) và dùng được,
 * mỗi nhân vật đứng đúng toạ độ trong bảng SK.HALL_POS. Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-hall5.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-hall5/.
 */
const PW = process.env.PLAYWRIGHT_PATH || '/home/bui-thanh-thuong/.cache/pw-node/node_modules/playwright-core';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-hall5');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔' : '✘') + ' ' + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

const errs = [];
let browser;
async function enterWalk(p) {
  await until(p, () => window.SK_GAME && SK_GAME.state === 'hall', null, 15000);
  await sleep(500);
  const at = await p.evaluate(() => SK.hall.npcScreen('knight'));
  await p.mouse.click(at.x, at.y);
  await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
  await p.click('#sk-start');
  await until(p, () => SK_GAME.state === 'hall' && SK.hall.state.mode === 'walk', null, 3000);
  await sleep(300);
}
// Trang mới với hồ sơ cho trước (null = hồ sơ trắng); chỉ gieo hồ sơ một lần mỗi phiên để tải lại trang giữ nguyên dữ liệu.
async function boot(profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  if (profile) await p.addInitScript(prof => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sk.profile.v1', JSON.stringify(prof)); sessionStorage.setItem('seeded', '1'); } }, profile);
  await p.goto(URL);
  await enterWalk(p);
  return p;
}
async function reload(p) { await p.goto(URL); await enterWalk(p); }
const dlgText = p => p.evaluate(() => document.getElementById('hs-modal').hidden ? null : document.getElementById('hs-dlg').innerText);
async function closeDlg(p) {
  await p.keyboard.press('Escape');
  await until(p, () => document.getElementById('hs-modal').hidden && !document.getElementById('sk-lobby').classList.contains('only-modes'), null, 2000);
  await sleep(350);
}

async function stand(p, slot) {
  const pos = await p.evaluate(slot => {
    const z = SK.hall.zones().find(q => q.slot === slot), b = z.box, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    let best = null;
    for (let dy = -3; dy <= 3; dy += 0.25) for (let dx = -3; dx <= 3; dx += 0.25) {
      const x = cx + dx, y = cy + dy;
      if (!SK.hall.walkable(x, y) || !SK.hall.walkable(x - 0.4, y) || !SK.hall.walkable(x + 0.4, y) || SK.hall.nearAt(x, y) !== slot) continue;
      const d = Math.hypot(dx, dy);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) { const me = SK.hallState.me; me.x = best.x; me.y = best.y; }
    return best;
  }, slot);
  await sleep(250);
  return pos;
}
async function useSlot(p, slot) {
  const pos = await stand(p, slot);
  if (!pos) return null;
  await p.keyboard.press('KeyE');
  for (let i = 0; i < 4 && !await until(p, () => !document.getElementById('hs-modal').hidden, null, 1200); i++) await p.keyboard.press('KeyE');
  await until(p, () => !document.getElementById('hs-modal').hidden, null, 2000);
  await sleep(150);
  return dlgText(p);
}
const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), timeout: 15000 }).catch(() => {});
const T = t => (t || '').replace(/\n/g, ' | ').slice(0, 160);
const ALL = ['aigirl', 'airbender', 'alchemist', 'arcaneknight', 'assassin', 'astrologist', 'bard', 'beheaded', 'captain', 'costumeprince', 'doctor', 'druid', 'elves', 'engineer', 'envoy', 'fighter', 'gunsexpert', 'joker', 'knight', 'ladychef', 'lancer', 'mage', 'miner', 'necromancer', 'ninja', 'officer', 'paladin', 'priest', 'ranger', 'robot', 'shooter', 'specialforces', 'swordmaster', 'taoist', 'transcendent', 'trapmaster', 'vampire', 'viking', 'warliege', 'warlock', 'werewolf', 'yinyang'];

(async () => {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ============ 1. Máy Đổi và Máy Game: vẽ bằng khoá prefab gốc, không còn khối giữ chỗ
    let p = await boot({ gems: 100, welcomed: 1, won: { knight: 1 }, unlocked: ['knight'], inv: { token_weapon_none_1: 2, token_seed_none_0: 1, token_blueprint_none_0: 1, token_skin_none_0: 1 } });
    await p.evaluate(() => { window.__dp = []; const o = SK.drawPrefab; SK.drawPrefab = function (c, parts) { window.__dp.push(parts); return o.apply(this, arguments); }; });
    await sleep(600);
    const zs = await p.evaluate(() => {
      const z = SK.hall.zones(), dp = window.__dp, P = SK.D.prefabs;
      return { arcade: z.find(q => q.slot === 'arcade_machine'), token: z.find(q => q.slot === 'token_machine'),
        drawnArcade: dp.some(x => x === P.arcade_machine), drawnToken: dp.some(x => x === P.token_machine), hasPf: [!!P.arcade_machine, !!P.token_machine], arcParts: P.arcade_machine ? P.arcade_machine.map(q => q.n + ':' + (q.f || '')) : [] };
    });
    check('prefab gốc arcade_machine và token_machine có trong dữ liệu dựng', zs.hasPf.every(Boolean), JSON.stringify(zs.hasPf));
    check('Máy Game và Máy Đổi không còn là khối giữ chỗ (kiosk = false)', zs.arcade && zs.token && !zs.arcade.kiosk && !zs.token.kiosk, JSON.stringify([zs.arcade && zs.arcade.kiosk, zs.token && zs.token.kiosk]));
    check('khung vẽ thật gọi drawPrefab với đúng bản vẽ arcade_machine và token_machine (khoá prefab gốc)', zs.drawnArcade && zs.drawnToken, JSON.stringify([zs.drawnArcade, zs.drawnToken]));
    check('arcade_machine gồm thân /img, màn hình hoạt ảnh và ghế (mảng vẽ từ prefab gốc)', ['/img:arcade_machine', '/img/screen:arcade_machine_screen_0', '/chair:arcade_machine_chair'].every(k => zs.arcParts.includes(k)), JSON.stringify(zs.arcParts));
    await p.evaluate(() => { SK.hall.labelsAll(true); });
    await stand(p, 'arcade_machine'); await sleep(400); await shot(p, 'arcade');
    // Máy Game: bảo trì, bốn câu quay vòng [LOC arcade_machine/talk_0..3]
    const lines = [];
    for (let i = 0; i < 5; i++) { const t = await useSlot(p, 'arcade_machine'); lines.push(t && (/Máy Game đang bảo trì|Các kỹ sư|Đang viết code|Đang vẽ đồ họa/.exec(t) || [''])[0]); await closeDlg(p); }
    check('Máy Game: 4 lần bấm ra 4 câu bảo trì khác nhau, lần 5 quay lại câu đầu', new Set(lines.slice(0, 4)).size === 4 && lines[4] === lines[0] && lines.every(Boolean), JSON.stringify(lines));
    // Máy Đổi
    await stand(p, 'token_machine'); await sleep(400); await shot(p, 'token');
    let t = await useSlot(p, 'token_machine');
    check('Máy Đổi liệt kê Vé Đổi trong túi (vũ khí, hạt giống, bản vẽ, skin)', t && /Vé Đổi Vũ Khí hạng 1/.test(t) && /Hạt Giống/.test(t) && /Bản Vẽ/.test(t) && /Skin/.test(t), T(t));
    await shot(p, 'token-dlg');
    const b0 = await p.evaluate(() => ({ inv: SK.profile.items(), box: SK.profile.box.length }));
    await p.click('#sk-tokens li:has-text("Vũ Khí hạng 1") button'); await sleep(250);
    const b1 = await p.evaluate(() => ({ inv: SK.profile.items(), box: SK.profile.box, g: SK.DS.weaponGrades })).catch(() => null);
    const got = b1 && b1.box[b1.box.length - 1];
    check('đổi 1 Vé Vũ Khí hạng 1: trừ đúng 1 vé (2 → 1), hòm vũ khí +1, vũ khí nhận được thuộc bậc 2',
      b1 && (b0.inv.token_weapon_none_1 | 0) === 2 && (b1.inv.token_weapon_none_1 | 0) === 1 && b1.box.length === b0.box + 1 && b1.g[2].includes(got), JSON.stringify({ t0: b0.inv.token_weapon_none_1, t1: b1 && b1.inv.token_weapon_none_1, got }));
    await p.click('#sk-tokens li:has-text("Hạt Giống") button'); await sleep(250);
    const typed = (t) => p.evaluate(t => { const inv = SK.profile.items(), I = SK_ITEMS.items; return { tok: Object.keys(inv).filter(k => /^token_/.test(k)).reduce((o, k) => (o[k] = inv[k], o), {}), got: Object.keys(inv).filter(k => I[k] && I[k].t === t).map(k => [k, inv[k], I[k].level]) }; }, t);
    const b2 = await typed('seed');
    check('đổi Vé Hạt Giống hạng 0: vé hết, nhận đúng 1 hạt giống hạng 0', !b2.tok.token_seed_none_0 && b2.got.length === 1 && b2.got[0][1] === 1 && b2.got[0][2] === 0, JSON.stringify(b2));
    await p.click('#sk-tokens li:has-text("Bản Vẽ") button'); await sleep(250);
    const b3 = await typed('bp');
    check('đổi Vé Bản Vẽ: vé hết, nhận đúng 1 bản vẽ chưa có', !b3.tok.token_blueprint_none_0 && b3.got.length === 1 && b3.got[0][1] === 1, JSON.stringify(b3));
    const skinBtn = await p.evaluate(() => { const li = [...document.querySelectorAll('#sk-tokens li')].find(l => /Skin/.test(l.innerText)); return li ? { dis: li.querySelector('button').disabled, txt: li.innerText.replace(/\n/g, ' ') } : null; });
    check('Vé Skin chưa có đích đổi: nút khoá, ghi "Không có vật phẩm có thể đổi", vé còn nguyên', skinBtn && skinBtn.dis && /Không có vật phẩm có thể đổi/.test(skinBtn.txt) && (await p.evaluate(() => SK.profile.item('token_skin_none_0'))) === 1, JSON.stringify(skinBtn));
    await closeDlg(p);
    await p.context().close();
    p = await boot({ gems: 100, welcomed: 1, won: { knight: 1 }, unlocked: ['knight'] });
    t = await useSlot(p, 'token_machine');
    check('Máy Đổi không có vé: "Cần Vé Đổi"', t && /Cần Vé Đổi/.test(t), T(t));
    await closeDlg(p);
    await p.context().close();

    // ============ 2. vị trí đứng nhân vật: mỗi người đúng toạ độ trong bảng, mở 40 nhân vật
    p = await boot({ gems: 100, welcomed: 1, won: { knight: 1 }, unlocked: ALL.slice() });
    const pos = await p.evaluate(() => { SK.hall.enter('select'); return { npcs: SK.hall.state.npcPos, tbl: SK.HALL_POS, deco: SK_HALL.deco }; });
    const DECO = { mage: 'magic_circle', vampire: 'cofin', engineer: 'toolbox', alchemist: 'tube', airbender: 'decorate_airbender', warlock: 'decorate_warlock' };
    const want = id => DECO[id] ? [pos.deco[DECO[id]][0], pos.deco[DECO[id]][1] - 1.2] : pos.tbl[id];
    const heroes = await p.evaluate(() => Object.keys(SK.D.heroes));
    check('đủ nhân vật trong sảnh: mỗi nhân vật dữ liệu có đúng 1 chỗ đứng (' + heroes.length + ')', pos.npcs.length === heroes.length && heroes.every(h => pos.npcs.filter(n => n[0] === h).length === 1), pos.npcs.length + '/' + heroes.length);
    const bad = pos.npcs.filter(n => { const w = want(n[0]); return !w || Math.abs(n[1] - w[0]) > 1e-6 || Math.abs(n[2] - w[1]) > 1e-6; });
    check('mỗi nhân vật đứng đúng toạ độ trong bảng (6 theo đồ trang trí gốc, ' + (heroes.length - 6) + ' theo bảng cố định)', bad.length === 0, JSON.stringify(bad.slice(0, 5)));
    const notWalk = await p.evaluate(npcs => npcs.filter(n => !['mage', 'vampire', 'engineer', 'alchemist', 'airbender', 'warlock'].includes(n[0]) && (!SK.hall.walkable(n[1], n[2]) || !SK.hall.walkable(n[1] - 0.5, n[2]) || !SK.hall.walkable(n[1] + 0.5, n[2]))).map(n => n[0]), pos.npcs);
    check('36 người theo bảng không đứng trong tường hay khối chặn (3 điểm quanh chân đều đi được; 6 người neo đồ gốc giữ nguyên chỗ cũ)', notWalk.length === 0, JSON.stringify(notWalk));
    let near = 99, pair = '';
    for (const a of pos.npcs) for (const b of pos.npcs) if (a[0] < b[0]) { const d = Math.hypot(a[1] - b[1], a[2] - b[2]); if (d < near) { near = d; pair = a[0] + '/' + b[0]; } }
    check('không ai đứng đè nhau (cách ≥ 2 đv)', near >= 2, near.toFixed(2) + ' ' + pair);
    const zn = await p.evaluate(npcs => { let m = 99, w = ''; for (const n of npcs.filter(q => !['mage', 'vampire', 'engineer', 'alchemist', 'airbender', 'warlock'].includes(q[0]))) for (const z of SK.hall.zones()) { const d = Math.hypot(n[1] - z.x, n[2] - z.y); if (d < m) { m = d; w = n[0] + '/' + z.slot; } } return [m, w]; }, pos.npcs);
    check('không ai đứng đè lên món nội thất (cách tâm ô ≥ 1,4 đv)', zn[0] >= 1.4, JSON.stringify(zn));
    await sleep(500); await shot(p, 'select-all');
    // vị trí không phụ thuộc thứ tự mở khoá
    const again = await p.evaluate(() => { SK.profile.unlocked.reverse(); SK.hall.enter('select'); return SK.hall.state.npcPos; });
    const diff = again.filter(n => { const o = pos.npcs.find(q => q[0] === n[0]); return !o || o[1] !== n[1] || o[2] !== n[2]; });
    check('đảo thứ tự mở khoá: mỗi nhân vật vẫn đúng chỗ cũ', again.length === pos.npcs.length && diff.length === 0, JSON.stringify(diff.slice(0, 3)));
    // chọn một nhân vật ngoài 6 người neo: bấm vào chỗ đứng thật dẫn tới màn chọn đó
    const hit = await p.evaluate(() => { SK.hall.enter('select'); return SK.hall.npcScreen('ranger'); });
    await p.mouse.click(hit.x, hit.y);
    const ok = await until(p, () => !document.getElementById('sk-lobby').hidden, null, 3000);
    const sel = await p.evaluate(() => SK.profile.selected || (SK.profile.sel && SK.profile.sel()) || null).catch(() => null);
    check('bấm vào chỗ đứng của Ranger (người không neo đồ trang trí) mở màn chọn nhân vật', ok, 'sel ' + JSON.stringify(sel));
    await p.context().close();

    const errsReal = errs.filter(e => !/fonts\.(googleapis|gstatic)|bosses86|theme|lib|colour/.test(e));
    check('không lỗi trang/console', errsReal.length === 0, errsReal.slice(0, 3).join(' | '));
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  console.log(out.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  process.exit(fail ? 1 : 0);
})();
