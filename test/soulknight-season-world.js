/*
 * Kiểm thử thế giới Season Mode của Hiệp Sĩ Linh Hồn (games/soulknight/js/season/world.js + season.js), dữ liệu thật 8.6.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-season-world.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-season-world/.
 *
 * Vòng thật: sảnh → thẻ "Chế độ mùa giải" → Bắt đầu → căn cứ (tilemap escape_terrain_init); đi bộ tới khi cây chặn;
 * đứng trong cổng xoáy 2 s → Vành Đai Căn Cứ (escape_terrain_scene1: 49 điểm quái, 27 rương, 3 điểm rút lui);
 * giữ J bắn khỉ (chụp 3 khung hoạt ảnh), mở rương quái bằng E → bảng rương lục dần → lấy hết; mở rương thường;
 * đứng ở điểm rút lui 4 s → về căn cứ. Lượt hai: gục → Rương Tử Vong nằm lại chỗ chết, lượt sau còn thấy.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-season-world');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) { pass++; results.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; results.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(80);
  }
  return false;
}
const info = p => p.evaluate(() => SK.SEASON.debug.info);
async function hold(p, key, ms) { await p.keyboard.down(key); await sleep(ms); await p.keyboard.up(key); }
async function press(p, key) { await p.keyboard.down(key); await sleep(60); await p.keyboard.up(key); await sleep(60); }

(async () => {
  const b = await chromium.launch();
  // 1300x560 -> khung nhìn ~650x280 px thế giới, gần khung ~647x300 của ảnh e_0929_101229
  const ctx = await b.newContext({ viewport: { width: 1300, height: 560 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
  await p.evaluate(() => {
    try { localStorage.removeItem('sk.season.v2'); } catch (_) { /* riêng tư */ }
    window.__ev = { kill: 0, loot: 0, extract: 0, death: 0, efire: 0 };
    SK.on('seasonKill', () => __ev.kill++); SK.on('seasonLoot', () => __ev.loot++);
    SK.on('seasonExtract', () => __ev.extract++); SK.on('seasonDeath', () => __ev.death++);
    SK.on('enemyFire', () => __ev.efire++);
    SK.SEASON.inv.reset();
  });

  // ---- sảnh → thẻ chế độ mùa giải
  await p.click('#hs-back');
  await p.click('.hs-mode[data-mode="season"]');
  const goTxt = await p.textContent('#hs-mode-go');
  check('thẻ mùa giải mở được', goTxt.trim() === 'Bắt đầu', 'nút: ' + goTxt.trim());
  await p.click('#hs-mode-go');
  const inSeason = await until(p, () => SK.G.state === 'season' && SK.SEASON.debug.info && SK.SEASON.debug.info.mode === 'base', null, 6000);
  let s = await info(p);
  const hero = await p.evaluate(() => { const h = SK.DS.heroes[SK.G.player.hero]; return { hp: h.hp, armor: h.armor }; });
  check('vào căn cứ Season Mode', inSeason, s && ('máu ' + s.hp + '/' + s.hpMax + ' giáp ' + s.armor));
  check('máu mùa = máu gốc + 2×giáp [ĐO OnCharacterAttrSetup], giáp 0', !!s && s.hpMax === hero.hp + 2 * hero.armor && s.armor === 0, s && s.hpMax + '');
  // tick đầu của mode mới chép vũ khí từ ô trang bị đè lên súng mặc định của sảnh
  await until(p, () => SK.SEASON.debug.info.weapons[0] === 'desert_eagle', null, 3000);
  const base = await p.evaluate(() => ({
    b: SK.G.map.buildings.map(q => q.id), npc: SK.G.season.npcs.map(n => n.id), W: SK.G.map.W, H: SK.G.map.H,
    spawn: [SK.G.player.x, SK.G.player.y], wep: SK.SEASON.debug.info.weapons[0]
  }));
  check('căn cứ dựng từ tilemap thật 115×65 đơn vị', base.W === 115 && base.H === 65, base.W + '×' + base.H);
  check('nhà có sẵn: Tiệm, Kho, Bàn Thiết Kế, Cơ sở huấn luyện; nhà chưa xây thì ẩn',
    ['Shop', 'Warehouse', 'DesignTable', 'Researcher'].every(k => base.b.includes(k)) && !base.b.includes('Workshop') && !base.b.includes('Kitchen'), base.b.join(','));
  check('Thầy Huấn Luyện đứng ở (17, 9.5)', base.npc.includes('esc_npc_trainer'), base.npc.join(','));
  check('bộ khởi đầu: Chim Ưng Sa Mạc [ĐO start_supply]', base.wep === 'desert_eagle', base.wep);
  await sleep(1500);
  await p.screenshot({ path: path.join(SHOTS, '1-base.png') });

  // ---- đi trong căn cứ: xuống đường dọc tới rừng phía nam
  const y0 = s.y;
  await hold(p, 'KeyS', 4200);
  s = await info(p);
  const blocked = await p.evaluate(() => { const P = SK.G.player; return SK.world.solidAt(SK.G.map, P.x, P.y + 6); });
  check('đi bằng phím trong căn cứ', s.y > y0 + 60, 'y ' + Math.round(y0) + ' → ' + Math.round(s.y));
  check('cây/nhà chặn lại (không xuyên)', blocked, 'dừng ở y ' + Math.round(s.y));
  await p.screenshot({ path: path.join(SHOTS, '2-base-walk.png') });

  // ---- cổng xoáy phía bắc: đứng 2 s
  await p.evaluate(() => { const g = SK.G.season.gates.find(q => q.kind === 'deploy'); SK.SEASON.debug.tp(g.x, g.y - 12); });
  const deployed = await until(p, () => SK.SEASON.debug.info.map === 's1' && SK.SEASON.debug.info.mode === 'expedition', null, 8000);
  s = await info(p);
  check('đứng trong cổng → Vành Đai Căn Cứ', deployed, s.map + ' · ' + s.enemies + ' quái · ' + s.crates + ' rương · cổng ' + s.gates.join(','));
  check('điểm thật: 49 quái, 27 rương, 2 điểm rút lui + cổng về', s.enemies === 49 && s.crates === 27 &&
    s.gates.filter(k => k === 'evac').length === 2 && s.gates.includes('home'));
  const stats = await p.evaluate(() => {
    const T = SK_SEASON_ITEMS.tables, out = {}, bad = [];
    for (const e of SK.G.enemies) {
      const want = Math.round(T.enemies[e.pid].hp * T.spawns[e.cfg].hpx);
      out[e.cfg] = e.hpMax + '/' + e.d.speed;
      if (e.hpMax !== want || e.d.speed !== T.enemies[e.pid].speed) bad.push(e.cfg + ' ' + e.hpMax + '≠' + want);
    }
    return { out, bad };
  });
  check('máu/tốc khỉ = game_tbaiattribute × HpMultiplier của điểm spawn (khỉ 40, vượn 1 50, tinh anh 100; scene2_* ×1.6)',
    stats.bad.length === 0 && stats.out.scene1_macaque_1 === '40/4' && stats.out.scene1_ape_1 === '50/6.5' && stats.out.scene1_macaque_elite === '100/4' && stats.out.scene2_ape_1 === '80/6.5',
    JSON.stringify(stats.out) + (stats.bad.length ? ' LỆCH ' + stats.bad.join(',') : ''));
  await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, '3-outskirt-entry.png') });

  // ---- đánh: giữ J; chụp 3 khung để thấy hoạt ảnh khỉ
  await p.evaluate(() => { SK.SEASON.debug.god(); SK.SEASON.debug.tpTo('enemy', 0); });
  await p.keyboard.down('KeyJ');
  const frames = [];
  for (let i = 0; i < 3; i++) {
    await sleep(260);
    await p.screenshot({ path: path.join(SHOTS, '4-fight-' + (i + 1) + '.png') });
    frames.push(await p.evaluate(() => {
      const e = SK.G.enemies.filter(q => q.st !== 'dead').sort((a, b) => Math.hypot(a.x - SK.G.player.x, a.y - SK.G.player.y) - Math.hypot(b.x - SK.G.player.x, b.y - SK.G.player.y))[0];
      if (!e) return null;
      const key = e.st === 'move' ? e.anims.run : e.anims.idle;
      return e.kind + ':' + e.st + ':' + SK.animFrame(key, e.t);
    }));
  }
  check('khỉ có hoạt ảnh thật (khung đổi theo thời gian, clip escape.ab)', frames.every(Boolean) && new Set(frames).size > 1, frames.join(' | '));
  const killed = await until(p, () => __ev.kill > 0, null, 25000);
  await p.keyboard.up('KeyJ');
  if (!killed) await p.evaluate(() => SK.SEASON.debug.killNearest());
  const ev1 = await p.evaluate(() => Object.assign({}, __ev));
  check('hạ khỉ bằng súng (seasonKill); khỉ bắn trả (enemyFire)', killed && ev1.efire > 0, 'kills ' + ev1.kill + ' · khỉ bắn ' + ev1.efire);
  const mc = await p.evaluate(() => {
    const c = SK.G.season.crates.find(q => /enemy_/.test(q.chestId) && !q.open);
    if (!c) return null;
    SK.SEASON.debug.tp(c.x, c.y + 12);
    return { weapon: c.weapon, id: c.chestId, prefab: c.prefab };
  });
  check('khỉ rớt Rương Quái Vật chứa vũ khí nó cầm', !!mc && !!mc.weapon, mc && (mc.id + ' · ' + mc.prefab + ' · ' + mc.weapon));
  await sleep(250);
  let label = (await info(p)).interact;
  await press(p, 'KeyE');
  const box0 = await p.evaluate(() => { const B = SK.SEASON.inv.box; return B && { n: B.slots.filter(Boolean).length, vis0: SK.SEASON.inv.boxVisible(0), mode: SK.SEASON.ui.mode }; });
  check('E mở bảng rương, đồ hiện dần (lục rương theo độ hiếm)', !!box0 && box0.mode === 'box' && box0.n > 0 && !box0.vis0, 'nhãn "' + label + '" · ' + JSON.stringify(box0));
  await sleep(700);
  await p.screenshot({ path: path.join(SHOTS, '5-monster-crate.png') });
  await until(p, () => { const B = SK.SEASON.inv.box; return B && B.slots.every((s, i) => !s || SK.SEASON.inv.boxVisible(i)); }, null, 15000);
  await p.evaluate(() => SK.SEASON.inv.takeAll());
  const got = await p.evaluate(() => {
    const I = SK.SEASON.inv.state;
    return { bag: I.backpack.filter(Boolean).map(x => x.id + 'x' + x.n), w2: I.equip.weapon2 && I.equip.weapon2.id, left: SK.SEASON.inv.box.slots.filter(Boolean).length };
  });
  check('Lấy hết: đồ vào balô, vũ khí vào ô vũ khí trống', got.left === 0 && (got.bag.length > 0 || got.w2), JSON.stringify(got));
  await p.evaluate(() => SK.SEASON.ui.close());

  // ---- rương thường
  await p.evaluate(() => SK.SEASON.debug.tpTo('crate', 0));
  await sleep(250);
  label = (await info(p)).interact;
  const before = (await info(p)).opened;
  await press(p, 'KeyE');
  await sleep(1800);
  s = await info(p);
  const ev2 = await p.evaluate(() => __ev.loot);
  check('mở rương thường (seasonLoot) theo bảng rơi thật', s.opened > before && ev2 >= 2, 'nhãn "' + label + '"');
  await p.screenshot({ path: path.join(SHOTS, '6-chest-open.png') });
  await p.evaluate(() => SK.SEASON.ui.close());

  // ---- điểm rút lui: 4 s [ĐO GateEvacuation.interactDuration]
  await p.evaluate(() => SK.SEASON.debug.tpTo('exit', 0));
  await sleep(2200);
  await p.screenshot({ path: path.join(SHOTS, '7-extract.png') });
  const midT = (await info(p)).extract;
  const back = await until(p, () => SK.SEASON.debug.info.map === 'base' && SK.SEASON.debug.info.mode === 'base', null, 8000);
  const ev3 = await p.evaluate(() => __ev.extract);
  check('đứng trong điểm rút lui 4 s → về căn cứ (seasonExtract)', back && ev3 === 1 && midT > 1 && midT < 4, 'đếm giữa chừng ' + midT.toFixed(1) + ' s');
  await sleep(900);
  await p.screenshot({ path: path.join(SHOTS, '8-back-at-base.png') });

  // ---- lượt chết: Rương Tử Vong
  await p.evaluate(() => { const g = SK.G.season.gates.find(q => q.kind === 'deploy'); SK.SEASON.debug.tp(g.x, g.y - 12); });
  await until(p, () => SK.SEASON.debug.info.mode === 'expedition', null, 8000);
  await p.evaluate(() => {
    const I = SK.SEASON.inv;
    I.add('material_wood_1', 3);
    I.state.secure = I.makeStack('misc_gold_coin', 1);
    SK.SEASON.debug.kill();
  });
  const died = await until(p, () => SK.SEASON.debug.info.mode === 'dead', null, 4000);
  const home = await until(p, () => SK.SEASON.debug.info.mode === 'base' && SK.SEASON.debug.info.map === 'base', null, 6000);
  const dead = await p.evaluate(() => {
    const I = SK.SEASON.inv.state;
    return { bag: I.backpack.filter(Boolean).length, box: I.deathBox && I.deathBox.slots.length, secure: I.secure && I.secure.id, st: SK.G.player.st };
  });
  const ev4 = await p.evaluate(() => __ev.death);
  check('gục → về căn cứ; balô + trang bị vào Rương Tử Vong, Rương An Toàn giữ [ĐO esc_tips_4]',
    died && home && ev4 === 1 && dead.bag === 0 && dead.box > 0 && dead.secure === 'misc_gold_coin' && dead.st === 'alive', JSON.stringify(dead));
  await p.evaluate(() => { const g = SK.G.season.gates.find(q => q.kind === 'deploy'); SK.SEASON.debug.tp(g.x, g.y - 12); });
  await until(p, () => SK.SEASON.debug.info.mode === 'expedition', null, 8000);
  const dbox = await p.evaluate(() => { const c = SK.G.season.crates.find(q => q.kind === 'death'); return c && c.stacks.length; });
  const mk = await p.evaluate(() => SK.SEASON.world.markers().map(m => m.kind));
  check('lượt sau Rương Tử Vong còn ở chỗ chết + có dấu trên bản đồ', dbox > 0 && mk.includes('death'), 'số món ' + dbox);
  check('markers() có bạn + điểm rút lui + rương', mk.includes('self') && mk.includes('exit') && mk.includes('crate'), [...new Set(mk)].join(','));

  await p.evaluate(() => SK.SEASON.exit());
  const lob = await until(p, () => SK.G.state === 'lobby', null, 3000);
  check('thoát về sảnh', lob);
  check('không lỗi trang', errs.length === 0, errs.slice(0, 4).join(' | '));
  await b.close();
  console.log(results.join('\n'));
  console.log('\n' + pass + '/' + (pass + fail) + ' đạt · ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
