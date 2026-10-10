/*
 * Chỉ Huy Nhỏ (games/soulknight): lõi chế độ (js/troop.js).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-troop.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-troop/.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-troop');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ')));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (fn, arg) => p.evaluate(fn, arg);

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });

  // ---- 1. thẻ chế độ + vào ván
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="troop"]');
  const card = await ev(() => ({ title: document.getElementById('hs-mode-title').textContent, go: !document.getElementById('hs-mode-go').disabled, img: document.getElementById('hs-mode-img').src.split('/').pop() }));
  check('bảng chế độ có thẻ Chỉ Huy Nhỏ, nút Bắt đầu bật', card.title === 'Chỉ Huy Nhỏ' && card.go, JSON.stringify(card));
  await ev(() => { document.getElementById('hs-modes').hidden = true; SK_GAME.debug.seed(11); SK.lobby.launch('knight', 'troop', []); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  const s0 = await ev(() => { const G = SK.G, pl = G.player; return { mode: SK_GAME.mode, n: SK.STAGES.length, hp: pl.hp, hpMax: pl.hpMax, ar: pl.armor, en: pl.energyMax, w: pl.weapons[0].id, pet: !!G.pet, petId: pl.petId, recs: G.troop.recs.length, coins: G.troop.coins, flag: G.troop.flag }; });
  check('vào ván: mode troop, 15 ải, người chơi là pet HP 3, giáp 1, NL 160, vũ khí cắn, không pet đi theo',
    s0.mode === 'troop' && s0.n === 15 && s0.hp === 3 && s0.hpMax === 3 && s0.ar === 1 && s0.en === 160 && s0.w === 'troop_bite' && !s0.pet && /^pet/.test(s0.petId), JSON.stringify(s0));
  check('khởi đầu: 1 lính (nhân vật đã chọn), 0 xu, cờ cấp 1', s0.recs === 1 && s0.coins === 0 && s0.flag === 1);
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '1-base.png') });

  // pet không mất máu khi bị đạn
  const hurt = await ev(() => { const G = SK.G, pl = G.player; SK.hurtPlayer(G, 3); SK.hurtPlayer(G, 5); return { hp: pl.hp, ar: pl.armor, st: pl.st }; });
  check('pet bị đánh không mất máu/giáp', hurt.hp === 3 && hurt.ar === 1 && hurt.st === 'alive', JSON.stringify(hurt));

  // pet cắn quái: máu quái giảm
  const bite = await ev(async () => {
    const G = SK.G, pl = G.player;
    const e = SK.makeEnemy(G, G.map.th.enemies.filter(id => SK.D.enemies[id])[0], pl.x + 14, pl.y, G.map.rooms[0]);
    e.hp = e.hpMax = 100; e.st = 'idle'; G.enemies.push(e);
    const h0 = e.hp;
    SK_GAME.debug.god(true);
    pl.aim = 0; pl.face = 1;
    const fire = SK.WEAPON_KINDS.melee.fire; fire(G, pl, pl.weapons[0], { x: pl.x, y: pl.y, ang: 0 });
    return { h0, h1: e.hp };
  });
  check('pet cắn quái: máu quái giảm đúng 5', bite.h0 - bite.h1 === 5, JSON.stringify(bite));


  // ---- 2. xu, cờ, thuê
  const T = fn => ev(fn);
  async function stageTo(label, type) {
    await ev(l => SK_GAME.debug.stage(l), label);
    await until(p, () => SK_GAME.phase === 'play', null, 6000);
    await ev(() => SK_GAME.debug.god(true));
    if (type) { await ev(t => SK_GAME.debug.teleportTo(t), type); await sleep(300); }
  }
  async function useLabel(re) {
    const i = await ev(s => SK.G.interactables.findIndex(o => new RegExp(s).test(o.label)), re);
    if (i < 0) return null;
    await ev(k => { const o = SK.G.interactables[k], pl = SK.G.player; pl.x = o.x; pl.y = o.y + 2; }, i);
    await sleep(150);
    const label = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
    await p.keyboard.press('KeyE');
    await sleep(150);
    return label;
  }
  const st = () => ev(() => { const t = SK.G.troop; return { coins: t.coins, flag: t.flag, n: t.recs.length, heroes: t.recs.map(r => r.hero + (r.up ? '+' : '')).join(','), recs: t.recs.map(r => ({ h: r.hero, up: r.up, hp: r.hp, ar: r.armor, dead: r.dead })) }; });

  await stageTo('1-1');
  let q = await st();
  check('ải 1-1 mới: 1 lính, 0 xu (xu chưa có thì không thuê được)', q.n === 1 && q.coins === 0);
  // hàng lính chờ và nút thuê
  const stock = await ev(() => SK.G.troop.stock.slice());
  check('cờ cấp 1 có 2 lính chờ', stock.length === 2 && stock.every(h => h), stock.join(','));
  // thiếu xu
  const hero1 = await ev(() => SK.G.troop.stock.find(h => h && h !== 'knight') || 'mage');
  let r = await ev(h => SK.troop.hire(SK.G, h), hero1);
  q = await st();
  check('thuê khi 0 xu bị từ chối, không trừ xu, không thêm lính', !r.ok && q.n === 1 && q.coins === 0, JSON.stringify(r));
  // xu: mở rương ở phòng đầu (rương trắng 2 xu)
  let lbl = await useLabel('Mở rương');
  q = await st();
  check('mở rương trắng ở phòng đầu (bấm E): +2 Xu Mèo, mở lần hai bị chặn', q.coins === 2 && /Mở rương/.test(lbl || ''), lbl + ' · xu ' + q.coins);
  await ev(() => SK.troop.openChest(SK.G)); q = await st();
  check('rương chỉ mở một lần mỗi ải', q.coins === 2, 'xu ' + q.coins);
  // xu dọn phòng thường +1
  await ev(() => { SK.G.troop.coins = 0; });
  await ev(() => SK_GAME.debug.teleportTo('battle', 0)); await sleep(500);
  await until(p, () => SK_GAME.rooms.some(r => r.state === 'locked'), null, 6000);
  await ev(() => SK_GAME.debug.clearRoom()); await sleep(200);
  q = await st();
  check('dọn phòng thường: +1 Xu Mèo', q.coins === 1, 'xu ' + q.coins);
  // thuê: 4 xu
  await ev(() => { SK.G.troop.coins = 5; });
  const hireLbl = await ev(h => (SK.G.interactables.find(o => o.label && o.label.indexOf('Thuê ' + (SK.DS.heroes[h].name)) === 0) || {}).label, hero1);
  const lbl2 = await useLabel('^Thuê ');
  q = await st();
  check('thuê lính (bấm E vào quầy): trừ 4 xu, lên 2 lính', q.coins === 1 && q.n === 2, (lbl2 || '') + ' · ' + JSON.stringify({ coins: q.coins, n: q.n, hs: q.heroes }));
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '2-hired.png') });
  // vượt cờ cấp 1 (tối đa 2)
  await ev(() => { SK.G.troop.coins = 10; });
  const h2 = await ev(() => SK.TROOP.ids.find(h => !SK.G.troop.recs.some(r => r.hero === h)));
  r = await ev(h => SK.troop.hire(SK.G, h), h2);
  q = await st();
  check('cờ cấp 1 chứa tối đa 2 lính: thuê lính thứ 3 khác loại bị từ chối ("Lính Thuê đã đạt tối đa")', !r.ok && /tối đa/.test(r.why) && q.n === 2 && q.coins === 10, JSON.stringify(r));
  // giá cờ 1/3/5/7, tổng 16, tối đa 3/4/5/6, lính chờ 3/3/4/5
  await ev(() => { SK.G.troop.coins = 16; });
  const flags = [];
  for (let i = 0; i < 4; i++) {
    const c0 = (await st()).coins;
    await ev(() => SK.troop.upgradeFlag(SK.G));
    const s2 = await ev(() => ({ coins: SK.G.troop.coins, flag: SK.G.troop.flag, cap: SK.troop.cap(SK.G), stock: SK.G.troop.stock.length }));
    flags.push([s2.flag, c0 - s2.coins, s2.cap, s2.stock].join('/'));
  }
  check('nâng cờ cấp 2..5: giá 1/3/5/7 (tổng 16), tối đa 3/4/5/6 lính, chờ 3/3/4/5', flags.join(' ') === '2/1/3/3 3/3/4/3 4/5/5/4 5/7/6/5' && (await st()).coins === 0, flags.join(' '));
  r = await ev(() => SK.troop.upgradeFlag(SK.G));
  check('cờ cấp 5 là cao nhất', !r.ok);
  await ev(() => { SK.G.troop.coins = 3; });
  r = await ev(h => SK.troop.hire(SK.G, h), h2); q = await st();
  check('thiếu xu (3 < 4) thì không thuê được', !r.ok && q.n === 2 && q.coins === 3, JSON.stringify(r));
  // làm mới 1 xu
  r = await ev(() => SK.troop.refresh(SK.G)); q = await st();
  check('Thầy Huấn Luyện làm mới hàng lính chờ: 1 xu', r.ok && q.coins === 2);
  // nâng rương
  await ev(() => { SK.G.troop.coins = 20; SK.G.troop.chestOpen = false; });
  const cc = [];
  for (let i = 0; i < 3; i++) {
    const c0 = (await st()).coins;
    await ev(() => SK.troop.upgradeChest(SK.G));
    const c1 = (await st()).coins;
    await ev(() => { SK.G.troop.chestOpen = false; }); const c2a = (await st()).coins;
    await ev(() => SK.troop.openChest(SK.G)); const c2 = (await st()).coins;
    cc.push((c0 - c1) + '/' + (c2 - c2a));
  }
  check('Mèo May Mắn nâng rương nâu/lam/vàng: giá 3/6/9, thu 3/4/5 xu', cc.join(' ') === '3/3 6/4 9/5', cc.join(' '));
  // trùm +3
  await stageTo('1-5', 'boss');
  await until(p, () => SK_GAME.rooms.some(r => r.type === 'boss' && r.state === 'locked'), null, 8000);
  const c3 = (await st()).coins;
  await ev(() => SK_GAME.debug.clearRoom()); await sleep(200);
  check('hạ trùm: +3 Xu Mèo', (await st()).coins - c3 === 3, 'xu ' + c3 + ' -> ' + (await st()).coins);

  // ---- 3. hợp nhất
  await stageTo('2-1');
  await ev(() => { const t = SK.G.troop; t.flag = 5; t.coins = 20; t.recs.length = 0; const T2 = SK.TROOP; t.recs.push({ hero: 'knight', up: false, hp: 60, armor: 8, dead: false }); SK.troop.respawn(SK.G); });
  const base3 = await st();
  check('chỉ số nền Kỵ Sĩ: HP 60, giáp 8', base3.recs[0].hp === 60 && base3.recs[0].ar === 8, JSON.stringify(base3.recs[0]));
  await ev(() => { SK.troop.hire(SK.G, 'mage'); SK.troop.hire(SK.G, 'mage'); });
  q = await st();
  check('thuê 2 Pháp Sư: ổn, 3 lính, chưa hợp nhất', q.n === 3 && q.heroes === 'knight,mage,mage' && q.coins === 12, JSON.stringify({ n: q.n, h: q.heroes, c: q.coins }));
  r = await ev(() => SK.troop.hire(SK.G, 'mage')); q = await st();
  const up = q.recs.find(x => x.h === 'mage');
  check('thuê Pháp Sư thứ 3: hợp nhất, số lính giảm 3 -> 2, bản nâng HP 80 giáp 24, trừ 4 xu',
    r.ok && r.merged && q.n === 2 && q.heroes === 'knight,mage+' && up.hp === 80 && up.ar === 24 && q.coins === 8, JSON.stringify({ r, q: q.heroes, up, c: q.coins }));
  check('thân xác lính khớp rec (2 lính sống trong trận)', (await ev(() => [...SK.G.troop.allies.values()].filter(a => !a.gone && !a.dead).length)) === 2);
  // bản nâng không hợp nhất tiếp
  await ev(() => { SK.troop.hire(SK.G, 'mage'); SK.troop.hire(SK.G, 'mage'); }); q = await st();
  check('chỉ bản thường mới hợp nhất: thêm 2 Pháp Sư thường thì có bản nâng + 2 bản thường', q.heroes === 'knight,mage+,mage,mage', q.heroes);
  await ev(() => { SK.G.troop.coins = 8; SK.troop.hire(SK.G, 'mage'); }); q = await st();
  check('Pháp Sư thường thứ 3 lại hợp nhất thành bản nâng thứ hai', q.heroes === 'knight,mage+,mage+', q.heroes);
  await p.screenshot({ path: path.join(SHOTS, '3-merged.png') });
  // chỉ số hợp nhất bảng đủ 17 loại (thường x2 = nâng)
  const tbl = await ev(() => SK.TROOP.ids.map(h => { const s = SK.TROOP.HEROES[h]; return s[0] + '/' + s[1] + '/' + s[2]; }).join(' '));
  check('17 anh hùng theo bảng wiki', (await ev(() => SK.TROOP.ids.length)) === 17 && /^60\/8\/5 60\/6\/10 40\/12\/0 60\/8\/10 50\/7\/5 50\/10\/5 50\/5\/5 45\/20\/0 50\/6\/10 80\/1\/5 40\/7\/0 60\/5\/0 50\/11\/0 80\/3\/5 40\/11\/0 60\/6\/10 50\/7\/0$/.test(tbl), tbl);

  // ---- 4. lính đánh quái, giáp trừ trước, chết, hồi sinh
  await ev(() => { const t = SK.G.troop; t.recs.length = 0; t.recs.push({ hero: 'knight', up: false, hp: 60, armor: 8, dead: false }, { hero: 'mage', up: false, hp: 40, armor: 12, dead: false }); SK.troop.respawn(SK.G); });
  await ev(() => SK_GAME.debug.teleportTo('battle', 0)); await sleep(400);
  const fight = await ev(async () => {
    const G = SK.G, pl = G.player;
    for (const e of G.enemies) { e.st = 'dead'; e.hp = 0; }
    const id = G.map.th.enemies.filter(id => SK.D.enemies[id])[0];
    const e = SK.makeEnemy(G, id, pl.x + 40, pl.y, G.room || G.map.rooms[0]); e.hp = e.hpMax = 500; e.st = 'idle'; e.spawnT = 0; G.enemies.push(e);
    const h0 = e.hp;
    for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 100)); if (e.hp < h0 - 20) break; }
    return { h0, h1: e.hp };
  });
  check('lính đánh quái: máu quái giảm', fight.h1 < fight.h0, JSON.stringify(fight));
  await p.screenshot({ path: path.join(SHOTS, '4-fight.png') });


  // ---- 5. giáp trừ trước, hồi sinh khi dọn phòng, qua cổng hồi đầy, Túi Chữa Trị, diệt hết
  await ev(() => { const G = SK.G, t = G.troop; for (const e of G.enemies) { e.st = 'dead'; e.hp = 0; } G.bullets.length = 0; t.recs.length = 0; t.recs.push({ hero: 'knight', up: false, hp: 60, armor: 8, dead: false }, { hero: 'mage', up: false, hp: 40, armor: 12, dead: false }); SK.troop.respawn(G); });
  const arm = await ev(() => { const G = SK.G, a = [...G.troop.allies.values()][0]; a.hp -= 5; return { hp: G.troop.recs[0].hp, ar: G.troop.recs[0].armor }; });
  check('lính trúng 5 sát thương: giáp trừ trước (8 -> 3), HP giữ 60', arm.hp === 60 && arm.ar === 3, JSON.stringify(arm));
  await ev(() => { const G = SK.G, pl = G.player; pl.energy = 160; SK.troop.C; SK.SKILLS.troop_heal.start(G, pl); });
  q = await st();
  check('Túi Chữa Trị (60 NL): mọi lính +5 giáp (3 -> 8)', q.recs[0].ar === 8 && (await ev(() => SK.G.player.energy)) === 100, JSON.stringify(q.recs[0]));
  await ev(() => { const G = SK.G; G.bullets.push({ side: 'e', x: 0, y: 0, vx: 0, vy: 0, r: 2, h: 6, dmg: 5000, life: 2, t: 0 }); const a = G.troop.allies.get(G.troop.recs[1]), k = G.troop.allies.get(G.troop.recs[0]), cx = SK.world.roomCenter(G.room || G.map.rooms[0])[0]; a.x = k.x + (k.x < cx ? 24 : -24); a.y = k.y; G.bullets[G.bullets.length - 1].x = a.x; G.bullets[G.bullets.length - 1].y = a.y - 7; });
  await sleep(300);
  q = await st();
  check('lính bị đạn lớn thì chết (rec.dead), lính còn lại vẫn sống', q.recs[1].dead && !q.recs[0].dead, JSON.stringify(q.recs.map(x => x.dead)));
  await ev(() => SK_GAME.debug.teleportTo('battle', 1)); await sleep(500);
  await until(p, () => SK_GAME.rooms.some(r => r.state === 'locked'), null, 6000);
  await ev(() => SK_GAME.debug.clearRoom()); await sleep(300);
  q = await st();
  check('dọn phòng: lính chết hồi sinh với 1/10 máu (4 của 40), giáp đầy', !q.recs[1].dead && q.recs[1].hp === 4 && q.recs[1].ar === 12, JSON.stringify(q.recs[1]));
  await stageTo('2-2'); q = await st();
  check('vào ải mới: mọi lính đầy máu giáp', q.recs[1].hp === 40 && q.recs[0].hp === 60 && q.recs[0].ar === 8, JSON.stringify(q.recs));
  await ev(() => { const G = SK.G; for (const a of G.troop.allies.values()) G.bullets.push({ side: 'e', x: a.x, y: a.y - 7, vx: 0, vy: 0, r: 2, h: 6, dmg: 5000, life: 2, t: 0 }); });
  await until(p, () => SK_GAME.state === 'dead', null, 6000);
  check('mọi lính chết thì thua ("Diệt hết"): state dead', (await ev(() => SK_GAME.state)) === 'dead');

  console.log(results.join('\n'));
  console.log('\nlỗi trang: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'không'));
  check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
