/*
 * HỐ XANH — đầu mũi xiên và drone cứu hộ.
 *
 * Chạy:  node test/ho-xanh-gear.js
 * Ảnh chụp ra SHOTS (mặc định %TEMP%/ho-xanh-gear-shots): ô đầu xiên và drone trong iDiver, hiệu ứng từng đầu xiên khi trúng cá,
 * drone kéo cá lên. Mở ra xem.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'ho-xanh-gear-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) { pass++; out.push('  ✔ ' + name + (detail ? '  — ' + detail : '')); }
  else { fail++; out.push('  ✘ ' + name + (detail ? '  — ' + detail : '')); }
}
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(browser, base, W, H) {
  const tag = W + 'x' + H;
  out.push('\n[' + tag + ']');
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const shot = name => page.screenshot({ path: path.join(SHOTS, tag + '-' + name + '.png') });
  const save = () => page.evaluate(() => HX_DEBUG.save());
  const closePop = async () => { if (await page.$('.pr-lup-ok')) await page.click('.pr-lup-ok'); await sleep(150); };
  const buy = async key => { await page.click('.pr-row[data-key="' + key + '"] .pr-buy'); await sleep(350); };

  // ---------- iDiver: mua, nâng, lắp đầu xiên; mua drone ----------
  await page.goto(base + '/games/ho-xanh/index.html?phase=prep&fresh=1&route=A01,B01,C03&theme=day');
  await page.waitForFunction(() => window.HX_DEBUG && HX_DEBUG.info().phase === 'prep' && document.querySelector('.pr-row[data-key="head:poison"]'));
  await sleep(600);
  const rows = await page.$$eval('#scr-prep .pr-row', r => r.map(e => e.dataset.key));
  check('thẻ Trang bị có ô drone và 8 ô đầu xiên', rows.includes('drone') && rows.filter(k => /^head:/.test(k)).join(',') ===
    'head:basic,head:strong,head:paralysis,head:poison,head:fire,head:chain,head:sleep,head:ice', rows.join(','));
  const dr0 = await page.$eval('.pr-row[data-key="drone"]', r => ({ lv: r.querySelector('.pr-lv.cur').textContent, btn: r.querySelector('.pr-buy').textContent, cost: r.querySelector('.pr-cost').textContent.trim() }));
  check('ô drone lúc chưa mua: "Chưa có", nút Mua, giá 1200', dr0.lv === 'Chưa có' && dr0.btn === 'Mua' && dr0.cost === '1200', JSON.stringify(dr0));
  await page.evaluate(() => HX_DEBUG.grant(30000));
  await page.click('.pr-tab[data-tab="guns"]'); await page.click('.pr-tab[data-tab="gear"]');
  await sleep(300);
  await buy('head:poison');
  let S = await save();
  check('mua mũi xiên độc: 180 vàng, cấp 1, lắp luôn', S.gold === 30000 - 180 && S.heads.lv.poison === 1 && S.heads.equipped === 'poison', S.gold + ' ' + JSON.stringify(S.heads));
  await closePop();
  await buy('head:poison');
  S = await save();
  check('nâng mũi xiên độc lên cấp 2: thêm 360 vàng', S.gold === 30000 - 540 && S.heads.lv.poison === 2, S.gold + ' ' + JSON.stringify(S.heads));
  await closePop();
  await buy('head:ice');
  await closePop();
  S = await save();
  check('mua mũi xiên băng thì lắp băng', S.heads.equipped === 'ice' && S.heads.lv.ice === 1, JSON.stringify(S.heads));
  const pbtn = await page.$eval('.pr-row[data-key="head:poison"] .pr-buy', b => b.textContent);
  await buy('head:poison');
  S = await save();
  check('ô độc đã có mà chưa lắp: nút "Lắp vào", bấm là lắp lại độc, không trừ tiền', pbtn === 'Lắp vào' && S.heads.equipped === 'poison' && S.gold === 30000 - 540 - 180, pbtn + ' ' + S.gold);
  const pv = await page.$eval('.pr-row[data-key="head:poison"]', r => ({ on: r.classList.contains('on'), lv: r.querySelector('.pr-lv.cur').textContent, st: r.querySelector('.pr-stat.cur').textContent }));
  check('ô độc đang lắp: viền sáng, Lv.2, chỉ số 3 máu/1s · 8s', pv.on && pv.lv === 'Lv.2' && /3 máu\/1s · 8s/.test(pv.st), JSON.stringify(pv));
  await buy('drone');
  S = await save();
  check('mua drone cứu hộ: 1200 vàng, 1 chiếc mỗi lượt', S.gear.drone === 1 && S.gold === 30000 - 540 - 180 - 1200, S.gold + ' drone ' + S.gear.drone);
  await closePop();
  await page.$eval('.pr-row[data-key="drone"]', r => r.scrollIntoView({ block: 'start' }));
  await sleep(250);
  await shot('1-shop-drone-heads');
  await page.$eval('.pr-row[data-key="head:ice"]', r => r.scrollIntoView({ block: 'end' }));
  await sleep(250);
  await shot('2-shop-heads');

  // ---------- vào lặn ----------
  await page.click('#prep-go');
  await page.click('#boat-skip');
  await page.waitForFunction(() => HX_DEBUG.info().phase === 'dive', null, { timeout: 90000 });
  await page.waitForFunction(() => HX_DEBUG.info().dave.state === 'swim', null, { timeout: 8000 });
  let I = await page.evaluate(() => ({ head: HX.game.loadout.head, drone: HX.game.drone && { left: HX.game.drone.left, max: HX.game.drone.max } }));
  check('lượt lặn đọc sổ: lắp mũi xiên độc cấp 2 (sát thương +5, icon gốc), G.drone còn 1/1',
    I.head.id === 'poison' && I.head.lv === 2 && I.head.dmg === 5 && /Item_PoisonHarpoonHead\.png$/.test(I.head.icon) && I.drone && I.drone.left === 1 && I.drone.max === 1, JSON.stringify(I));
  await page.evaluate(() => {
    const orig = HX.audio.play; window.__played = [];
    HX.audio.play = function (k, o) { window.__played.push(k); return orig(k, o); };
    HX_DEBUG.holdSpawns(true); HX_DEBUG.clearFish();
  });
  const played = () => page.evaluate(() => window.__played.splice(0));
  const spot = await page.evaluate(() => {
    const W = HX.game.world;
    for (let y = 12; y > -30; y -= 0.7) for (let x = -40; x < 30; x += 0.9) {
      if (!W.open(x, y, 1.6)) continue;
      let ok = true;
      for (let k = 1; k <= 7 && ok; k++) ok = W.open(x + k, y, 1.5);
      if (ok && !W.raycast(x, y, x + 7, y) && !W.raycast(x, y + 1.5, x + 7, y + 1.5) && !W.raycast(x, y - 1.5, x + 7, y - 1.5)) return { x, y };
    }
    return null;
  });
  check('tìm được chỗ nước trống thoáng 7 m', !!spot, JSON.stringify(spot));
  if (!spot) { await page.close(); return; }
  const home = async () => {
    await page.waitForFunction(() => ['swim', 'shoot'].includes(HX_DEBUG.info().dave.state), null, { timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => HX.game.harpoon.state === 'ready', null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(s => {
      HX_DEBUG.teleport(s.x, s.y); HX.game.diver.facing = 1; HX_DEBUG.clearFish(); HX.game.catches.length = 0;
      HX_DEBUG.setO2(90); HX.game.diver.invuln = 0; HX.game.harpoon.lastHit = null;
    }, spot);
    await sleep(150);
  };
  // lắp đầu xiên qua sổ rồi dựng lại mũi xiên của lượt đang chạy (sổ là nguồn duy nhất của G.loadout.head)
  const setHead = (id, lv) => page.evaluate(([id, lv]) => {
    HX.save.commit(s => { if (id !== 'basic') s.heads.lv[id] = lv; s.heads.equipped = id; });
    const G = HX.game;
    G.loadout.head = HX_META.loadout(HX.save.get()).head;
    G.harpoon.remove(); G.harpoon = new HX.Harpoon(G);
    return G.loadout.head.id + ' ' + G.loadout.head.lv;
  }, [id, lv]);
  const spawn = (id, dx, dy, hp) => page.evaluate(([s, id, dx, dy, hp]) => {
    const uid = HX_DEBUG.spawnFish(id, s.x + dx, s.y + dy, true);
    if (hp) HX.game.fishes.list.find(f => f.id === uid).hp = hp;
    return uid;
  }, [spot, id, dx, dy, hp]);
  const fish = uid => page.evaluate(id => {
    const f = HX.game.fishes.list.find(q => q.id === id);
    return f ? { state: f.state, hp: f.hp, slow: f.slow, buffs: Object.keys(f.buffs), tint: f.fu.tint.value.toArray().map(v => Math.round(v * 1000) / 1000) } : null;
  }, uid);
  // tỉ lệ bùa: rng = 0 thì chắc trúng, 1 thì chắc trượt
  const rng = v => page.evaluate(v => { if (!window.__rand) window.__rand = Math.random; Math.random = v == null ? window.__rand : () => v; }, v);
  const shoot = async (dx, dy) => {
    const t = await page.evaluate(([s, dx, dy]) => { HX.game.harpoon.lastHit = null; return HX_DEBUG.worldToScreen(s.x + dx, s.y + dy); }, [spot, dx, dy]);
    await page.mouse.move(t.x, t.y);
    await page.mouse.down();
    await sleep(380);
    await page.mouse.up();
    await page.waitForFunction(() => HX.game.harpoon.lastHit, null, { timeout: 2000 }).catch(() => {});
    return page.evaluate(() => HX.game.harpoon.lastHit);
  };
  const fxNames = () => page.evaluate(() => HX_DEBUG.info().fx);

  // mũi xiên cường hoá cấp 1: 3 + 4 = 7
  await home();
  await setHead('strong', 1);
  let u = await spawn('Coral_Trout', 2.4, 0);
  let hit = await shoot(2.4, 0);
  let F = await fish(u);
  check('mũi xiên cường hoá cấp 1: cá mú chấm 37 máu còn 30 (xiên 3 + đầu 4)', hit && hit.dmg === 7 && F.hp === 30, JSON.stringify(hit) + ' ' + JSON.stringify(F));

  // mũi xiên điện cấp 1: 60% tê liệt 10 giây, chậm 30%
  await home();
  await setHead('paralysis', 1);
  u = await spawn('Coral_Trout', 2.4, 0);
  await played();
  await rng(0);
  hit = await shoot(2.4, 0);
  await rng(null);
  await sleep(120);
  F = await fish(u);
  let names = await fxNames(), snd = await played();
  check('mũi xiên điện trúng: cá 30 máu, bùa shock, bơi còn ×0,7, màu phủ #46460F (a 0,275), hạt VFX_Debuff_Elec_Body_01 gốc, tiếng điện',
    F.hp === 30 && F.buffs.join() === 'shock' && Math.abs(F.slow - 0.7) < 1e-6 && F.tint.join() === '0.275,0.275,0.059,0.275' &&
    names.includes('buff:shock') && names.includes('hitParalysis') && snd.includes('gear_paralysis_hit') && snd.includes('gear_paralysis_shot'),
    JSON.stringify(F) + ' ' + names.join(',') + ' ' + snd.join(','));
  await shot('3-hit-paralysis');
  await home();
  u = await spawn('Coral_Trout', 2.4, 0);
  await rng(0.99);
  await shoot(2.4, 0);
  await rng(null);
  F = await fish(u);
  check('mũi xiên điện trượt tỉ lệ (rng 0,99 > 0,6): không tê liệt, vẫn ăn 7 sát thương', F.hp === 30 && !F.buffs.length && F.slow === 1, JSON.stringify(F));

  // mũi xiên độc cấp 2 (mua ở iDiver): 3 + 5 = 8; 3 máu mỗi giây trong 8 giây
  await home();
  await setHead('poison', 2);
  u = await spawn('Coral_Trout', 2.4, 0);
  hit = await shoot(2.4, 0);
  const pT = await page.evaluate(() => HX.game.t);
  F = await fish(u);
  const hp0 = F.hp;
  await page.waitForFunction(t0 => HX.game.t - t0 > 1.15, pT);
  const F1 = await fish(u);
  await page.waitForFunction(t0 => HX.game.t - t0 > 2.15, pT);
  const F2 = await fish(u);
  names = await fxNames();
  check('mũi xiên độc cấp 2: trúng còn 29 máu, 1 giây sau 26, 2 giây sau 23 (3 máu/giây), hạt độc thân + đầu gốc',
    hp0 === 29 && F1.hp === 26 && F2.hp === 23 && F2.buffs.join() === 'poison' && names.includes('buff:poison') && names.includes('buffHead:poison'),
    [hp0, F1.hp, F2.hp].join(' → ') + ' ' + names.filter(n => /buff|hit/.test(n)).join(','));
  await shot('4-hit-poison');

  // mũi xiên lửa cấp 1: 3 + 5 = 8, cháy 1 giây rồi ăn thêm 30% × 8 = 2
  await home();
  await setHead('fire', 1);
  u = await spawn('Coral_Trout', 2.4, 0);
  await shoot(2.4, 0);
  F = await fish(u);
  await sleep(250);
  names = await fxNames();
  await shot('5-hit-fire');
  await page.waitForFunction(id => (HX.game.fishes.list.find(q => q.id === id) || {}).hp === 27, u, { timeout: 2500 }).catch(() => {});
  const Ff = await fish(u);
  check('mũi xiên lửa cấp 1: trúng còn 29, cháy xong còn 27 (+30% × 8 = 2), hạt VFX_Debuff_Burn_Body_01 gốc',
    F.hp === 29 && Ff.hp === 27 && names.includes('buff:burn'), F.hp + ' → ' + Ff.hp + ' ' + names.filter(n => /buff/.test(n)).join(','));

  // mũi xiên sét cấp 1: 3 + 4 = 7, sét lan 50% (4) sang con gần nhất
  await home();
  await setHead('chain', 1);
  u = await spawn('Coral_Trout', 2.4, 0);
  const u2 = await spawn('Coral_Trout', 2.4, 1.6);
  const u3 = await spawn('Coral_Trout', 4.0, 0);   // cách con thứ hai 2,3 m: sét nảy tiếp được
  // đang ngắm: hào quang sét (cụm VFX_LightinigHarpoonHead_A_01 của prefab đầu xiên gốc) trên mũi xiên trong súng
  const aim0 = await page.evaluate(([s]) => HX_DEBUG.worldToScreen(s.x + 2.4, s.y), [spot]);
  await page.mouse.move(aim0.x, aim0.y);
  await page.mouse.down();
  await sleep(420);
  names = await fxNames();
  await shot('6a-aim-aura-chain');
  await page.mouse.up();
  check('ngắm với mũi xiên sét: hào quang đầu xiên gốc bám mũi xiên', names.includes('aura'), names.join(','));
  await page.waitForFunction(() => HX.game.harpoon.lastHit, null, { timeout: 2000 }).catch(() => {});
  await sleep(1000);
  const c1 = await fish(u), c2 = await fish(u2), c3 = await fish(u3);
  names = await fxNames();
  const chained = await page.evaluate(() => HX.game.harpoon.chained);
  check('mũi xiên sét cấp 1: con trúng còn 30, sét nảy hai lần sang hai con gần đó, mỗi con mất 4 (50% × 7 làm tròn)',
    c1.hp === 30 && c2.hp === 33 && c3.hp === 33 && chained === 2, [c1.hp, c2.hp, c3.hp].join(',') + ' nảy ' + chained);
  await shot('6-hit-chain');

  // mũi xiên gây mê cấp 1: 40% ngủ ngay 7 giây; cá nhỏ kéo về còn sống, cá lớn ngủ tại chỗ
  await home();
  await setHead('sleep', 1);
  u = await spawn('Mackerel_Scad', 2.4, 0);
  await rng(0);
  hit = await shoot(2.4, 0);
  await rng(null);
  await page.waitForFunction(() => HX.game.catches.length === 1, null, { timeout: 4000 }).catch(() => {});
  I = await page.evaluate(() => HX.game.catches.slice());
  check('mũi xiên gây mê trúng cá nục thu (18 máu, cá không phải xả thịt): ngủ ngay, dây kéo về túi còn sống', hit && hit.held === 'held' && hit.res === 'alive' && JSON.stringify(I) === '["Mackerel_Scad"]',
    JSON.stringify(hit) + ' ' + JSON.stringify(I));
  await home();
  u = await spawn('Green_Humphead_Parrotfish', 2.6, 0);
  await rng(0);
  await shoot(2.6, 0);
  await rng(null);
  await sleep(200);
  F = await fish(u);
  names = await fxNames();
  check('mũi xiên gây mê trúng cá mó đầu gù (cá lớn): ngủ tại chỗ, mũi xiên thu về, hạt Z ngủ gốc', F.state === 'sleep' && F.hp === 72 &&
    names.includes('sleep') && (await page.evaluate(() => HX.game.harpoon.state)) !== 'stuck', JSON.stringify(F) + ' ' + names.join(','));
  await shot('7-hit-sleep');

  // mũi xiên băng cấp 1: 30% đóng băng 5 giây; đánh cá đông đá ăn thêm 20
  await home();
  await setHead('ice', 1);
  u = await spawn('Coral_Trout', 2.4, 0);
  await played();
  await rng(0);
  await shoot(2.4, 0);
  await rng(null);
  await sleep(200);
  F = await fish(u);
  names = await fxNames();
  snd = await played();
  check('mũi xiên băng trúng: cá đông đá (iced), còn 30 máu, hạt VFX_Debuff_Freezing_Body_01, tiếng đóng băng gốc',
    F.state === 'iced' && F.hp === 30 && F.buffs.join() === 'freeze' && names.includes('buff:freeze') && snd.includes('gear_ice_freeze'),
    JSON.stringify(F) + ' ' + snd.join(','));
  await shot('8-hit-ice');
  await page.waitForFunction(() => HX.game.harpoon.state === 'ready', null, { timeout: 4000 }).catch(() => {});
  await rng(0.99);
  await shoot(2.4, 0);
  await rng(null);
  await sleep(150);
  F = await fish(u);
  snd = await played();
  check('xiên lần hai vào cá đông đá: vỡ băng, ăn 7 + 20 = 27, còn 3 máu, tiếng vỡ băng gốc', F.hp === 3 && F.state !== 'iced' && !F.buffs.length && snd.includes('gear_ice_break'),
    JSON.stringify(F) + ' ' + snd.join(','));

  // ---------- drone cứu hộ: gọi trên xác cá khế vây vàng ----------
  await home();
  await setHead('basic', 1);
  const gt = await spawn('Giant_Trevally', 1.4, 0);
  await page.evaluate(id => HX.game.fishes.list.find(q => q.id === id).damage(999, 0, 0, false), gt);
  await page.waitForFunction(id => (HX.game.fishes.list.find(f => f.id === id) || {}).state === 'dead', gt, { timeout: 5000 }).catch(() => {});
  await page.evaluate(id => { const f = HX.game.fishes.list.find(q => q.id === id), c = f.center(); HX_DEBUG.teleport(c.x - f.hw - 0.2, c.y); }, gt);
  await sleep(200);
  let D = await page.evaluate(() => { const p = HX.game.diver.harvestPrompt(); return { can: HX.game.drone.canCall(), prompt: p && { drone: p.drone, carve: p.carve } }; });
  check('cạnh xác cá khế vây vàng: G.drone.canCall() và lời nhắc có drone + xả thịt', D.can && D.prompt && D.prompt.drone === true && D.prompt.carve === true, JSON.stringify(D));
  await played();
  await page.keyboard.press('ControlLeft');
  await sleep(100);
  I = await page.evaluate(() => ({ st: HX.game.diver.state, anim: HX.game.diver.animName, left: HX.game.drone.left }));
  snd = await played();
  check('bấm Ctrl trái: Dave gọi drone (clip WaitEscapepod của trigger CallEscapePod gốc, tiếng sound_Call_Drone_01)',
    I.st === 'callDrone' && I.anim === 'Wait' && snd.includes('gear_drone_call') && I.left === 1, JSON.stringify(I) + ' ' + snd.join(','));
  await page.waitForFunction(() => HX.game.drone.left === 0, null, { timeout: 3000 }).catch(() => {});
  I = await page.evaluate(() => ({ left: HX.game.drone.left, flights: HX.game.drone.flights.length, st: HX.game.diver.state, fish: HX.game.fishes.list.filter(f => f.state === 'lifted').length, can: HX.game.drone.canCall() }));
  check('sau 2 giây gọi: G.drone.left 1 → 0, một drone đang bay, cá chuyển sang lifted, Dave bơi tiếp, hết drone thì canCall() false',
    I.left === 0 && I.flights === 1 && I.fish === 1 && I.st === 'swim' && I.can === false, JSON.stringify(I));
  // đường bay là root motion của clip gốc: tới lơ lửng trên cá ở giây 5,3 (clip A), bám cá từ giây 6,7 rồi bay đi
  await page.waitForFunction(() => { const f = HX.game.drone.flights[0]; return f && f.t >= 5.6; }, null, { timeout: 12000 }).catch(() => {});
  D = await page.evaluate(() => {
    const f = HX.game.drone.flights[0]; if (!f || !f.node) return null;
    const v = new THREE.Vector3(); f.bones.Bone_DroneBody.getWorldPosition(v); const c = f.fish.center();
    let n = 0; f.node.traverse(o => { if (o.isMesh) n++; });
    return { phase: f.phase, clip: f.clip, dx: +(v.x - c.x).toFixed(2), dy: +(v.y - c.y).toFixed(2), z: +v.z.toFixed(2), meshes: n, fx: HX_DEBUG.info().fx.filter(k => /drone/i.test(k)) };
  });
  check('giây 5,6: drone 3D gốc (7 mảnh lưới, clip Move_A) lơ lửng ngay trên xác cá (lệch ngang < 0,3 m, cao hơn 0,3–1,5 m, sát mặt phẳng chơi), thả lưới, hạt cánh quạt gốc',
    D && D.phase === 'net' && D.meshes === 7 && /Move_A/.test(D.clip) && Math.abs(D.dx) < 0.3 && D.dy > 0.3 && D.dy < 1.5 && Math.abs(D.z) < 0.6 &&
    D.fx.includes('droneNetTrap') && D.fx.includes('drone:dronePropL1'), JSON.stringify(D));
  await shot('9-drone-arrive');
  await page.waitForFunction(() => { const f = HX.game.drone.flights[0]; return f && f.t >= 8.6; }, null, { timeout: 8000 }).catch(() => {});
  D = await page.evaluate(() => {
    const f = HX.game.drone.flights[0]; if (!f || !f.node) return null;
    const v = new THREE.Vector3(); f.bones.Bone_DroneBody.getWorldPosition(v); const c = f.fish.center();
    return { phase: f.phase, dy: +(v.y - c.y).toFixed(2), dx: +(v.x - c.x).toFixed(2), z: +v.z.toFixed(2), fz: +f.fish.z.toFixed(2), state: f.fish.state };
  });
  check('giây 8,6: drone mang cá bay đi theo clip (cá treo dưới bụng, cùng rời mặt phẳng chơi)',
    D && D.phase === 'away' && D.state === 'lifted' && D.dy > 0.3 && Math.abs(D.dx) < 0.3 && D.z > 1 && Math.abs(D.fz - D.z) < 0.6, JSON.stringify(D));
  const dShot = await page.evaluate(() => { const f = HX.game.drone.flights[0]; return f ? HX_DEBUG.worldToScreen(f.x, f.y) : null; });
  await shot('10-drone-lift');
  await page.waitForFunction(() => HX.game.drone.delivered.length === 1, null, { timeout: 12000 }).catch(() => {});
  I = await page.evaluate(() => ({ del: HX.game.drone.delivered.slice(), catches: HX.game.catches.slice(), flights: HX.game.drone.flights.length, toast: document.getElementById('toast').textContent }));
  check('drone đưa cá khế vây vàng lên thuyền: vào danh sách cá drone, không chiếm túi', JSON.stringify(I.del) === '["Giant_Trevally"]' && I.catches.length === 0 && I.flights === 0 && /Drone/.test(I.toast),
    JSON.stringify(I) + ' ' + JSON.stringify(dShot));

  // hết drone: bấm gọi thì Dave nhún vai (failAnimTrigger Overloaded), báo hết drone
  await home();
  const gt2 = await spawn('Asian_Sheepshead', 1.2, 0);
  await page.evaluate(id => HX.game.fishes.list.find(q => q.id === id).damage(999, 0, 0, false), gt2);
  await page.waitForFunction(id => (HX.game.fishes.list.find(f => f.id === id) || {}).state === 'dead', gt2, { timeout: 5000 }).catch(() => {});
  await page.evaluate(id => { const f = HX.game.fishes.list.find(q => q.id === id), c = f.center(); HX_DEBUG.teleport(c.x - f.hw - 0.2, c.y); }, gt2);
  await sleep(200);
  await page.keyboard.press('ControlLeft');
  await sleep(100);
  I = await page.evaluate(() => ({ anim: HX.game.diver.animName, toast: document.getElementById('toast').textContent, left: HX.game.drone.left }));
  check('hết drone mà bấm Ctrl: Dave nhún vai (Overloaded), báo "Hết drone cứu hộ"', I.anim === 'Overloaded' && /Hết drone/.test(I.toast) && I.left === 0, JSON.stringify(I));

  // lên bờ: cá drone đã ở trên thuyền, vào tủ cá
  await sleep(600);
  await page.evaluate(() => HX.game.onSurface());
  await sleep(300);
  I = await page.evaluate(() => ({ kept: HX_DEBUG.info().kept, fridge: HX_DEBUG.save().fridge }));
  check('lên bờ: cá drone kéo lên nằm trong mẻ cá và tủ cá', I.kept.includes('Giant_Trevally') && I.fridge.Giant_Trevally === 1, JSON.stringify(I));

  check('không có lỗi trang, lỗi console hay tải hỏng', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.close();
}

(async () => {
  const srv = process.env.HX_BASE ? null : await serve();
  const base = process.env.HX_BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await run(browser, base, 1280, 720);
  } catch (e) {
    check('bộ kiểm chạy hết không vỡ', false, e.stack);
  }
  await browser.close();
  if (srv) srv.close();
  console.log(out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
