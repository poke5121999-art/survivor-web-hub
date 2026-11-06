/*
 * Chỉ Huy Nhỏ (games/soulknight): lõi chế độ (js/troop.js) và đợt 2 (js/troop2.js: kỹ năng lính, Còi, vũ khí pet, quầy rượu, cúp).
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
    pl.aim = 0; pl.face = 1; pl.crit = 0;   // không chí mạng ngẫu nhiên: đo đúng 5
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
  await ev(() => { const G = SK.G, a = G.troop.allies.get(G.troop.recs[1]); a.hp -= 5000; a.dead = true; a.onDie(G, a); });   // cùng đường đi với đạn địch trúng lính (addWeaponAlly), không phụ thuộc vị trí hai lính
  await sleep(300);
  q = await st();
  check('lính bị đạn lớn thì chết (rec.dead), lính còn lại vẫn sống', q.recs[1].dead && !q.recs[0].dead, JSON.stringify(q.recs.map(x => x.dead)));
  await ev(() => SK_GAME.debug.teleportTo('battle', 1)); await sleep(500);
  await until(p, () => SK_GAME.rooms.some(r => r.state === 'locked'), null, 6000);
  await ev(() => SK_GAME.debug.clearRoom()); await sleep(300);
  q = await st();
  check('dọn phòng: lính chết hồi sinh với 1/10 máu (4 của 40), giáp đầy', !q.recs[1].dead && q.recs[1].hp === 4 && q.recs[1].ar === 12, JSON.stringify(q.recs[1]));
  await ev(() => { window.__lg = []; if (!window.__lgh) { window.__lgh = 1; SK.on('roomClear', (G, r) => window.__lg.push('clear ' + r.type)); SK.on('troopDie', () => window.__lg.push('die')); SK.on('stageEnter', () => window.__lg.push('enter')); } });
  await stageTo('2-2'); q = await st(); const lg22 = await ev(() => window.__lg.join() + ' | ' + SK_GAME.state + ' ' + SK.G.stage.label + ' ' + SK_GAME.phase);
  check('vào ải mới: mọi lính đầy máu giáp', q.recs[1].hp === 40 && q.recs[0].hp === 60 && q.recs[0].ar === 8, JSON.stringify(q.recs) + lg22);
  await ev(() => { const G = SK.G; for (const a of G.troop.allies.values()) G.bullets.push({ side: 'e', x: a.x, y: a.y - 7, vx: 0, vy: 0, r: 2, h: 6, dmg: 5000, life: 2, t: 0 }); });
  await until(p, () => SK_GAME.state === 'dead', null, 6000);
  check('mọi lính chết thì thua ("Diệt hết"): state dead', (await ev(() => SK_GAME.state)) === 'dead');


  // ================= đợt 2 =================
  // thiết lập chung: ván mới ở 1-1, đội = danh sách {hero, up}, quái đứng cạnh lính
  await ev(() => { SK.troop.profReset(); });
  await ev(() => { document.getElementById('sk-over') && (document.getElementById('sk-over').hidden = true); });
  async function freshRun() {
    await ev(() => { try { SK.lobby.enter(); } catch (e) { /* chưa ở ván */ } SK_GAME.debug.seed(21); SK.lobby.launch('knight', 'troop', []); });
    await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play' && SK.G.troop && SK.G.troop.stats.wins === 0 && SK.G.troop.recs.length === 1, null, 12000);
    await ev(() => { SK_GAME.debug.god(true); window.__tp = { skill: 0, petSkill: 0 }; if (!window.__tpHook) { window.__tpHook = 1; SK.on('troopSkill', () => window.__tp.skill++); SK.on('troopPetSkill', () => window.__tp.petSkill++); } });
  }
  await freshRun();
  await stageTo('1-1');
  const setTeam = heroes => ev(hs => {
    const G = SK.G, t = G.troop, pl = G.player;
    for (const e of G.enemies) { e.st = 'dead'; e.hp = 0; }
    G.bullets.length = 0; for (const pr of G.props) if (pr.tr2) pr.gone = true; for (const a of SK.weaponAllies(G)) if (a.tr2) a.gone = true;
    t.recs.length = 0; for (const h of hs) { const r = SK.troop.newRec(h.hero); r.up = !!h.up; const s = SK.troop.stat(r); r.hp = s.hp; r.armor = s.armor; t.recs.push(r); }
    SK.troop.respawn(G); return t.recs.length;
  }, heroes);
  const foe = (dx, dy, hp, opt) => ev(o => {
    const G = SK.G, pl = G.player, a = [...G.troop.allies.values()][0] || pl;
    const id = G.map.th.enemies.filter(id => SK.D.enemies[id])[0];
    const e = SK.makeEnemy(G, id, (o.fromPet ? pl.x : a.x) + o.dx, (o.fromPet ? pl.y : a.y) + o.dy, G.room || G.map.rooms[0]);
    e.hp = e.hpMax = o.hp; e.st = 'idle'; e.spawnT = 0; if (o.freeze) { e.st = 'stun'; e.stT = 999; } G.enemies.push(e); return true;
  }, Object.assign({ dx, dy, hp }, opt || {}));

  // ---- 6. kỹ năng riêng của lính: mỗi anh hùng một kỹ năng, đo hiệu ứng
  const SKILLCASE = {
    knight: { chk: r => r.buffT > 0 && r.dmgMul === 2, what: 'sát thương x2 trong 5 s' },
    ranger: { chk: r => r.eHp0 - r.eHp1 >= 30, what: 'Iaido 5 nhát = 30 sát thương' },
    mage: { chk: r => r.eHp0 - r.eHp1 >= 10 && r.eStunSeen, what: 'sét 10 sát thương + choáng' },
    assassin: { chk: r => r.kinds.clone === 1, what: '1 phân thân' },
    alchemist: { chk: r => r.zones >= 3 && r.eHp0 - r.eHp1 >= 3, what: '3 vũng + sát thương' },
    engineer: { chk: r => r.kinds.turret === 1, what: 'tháp súng' },
    vampire: { chk: r => r.zones >= 1 && r.eHp0 - r.eHp1 >= 3, what: 'lỗ đen hút máu' },
    paladin: { chk: r => r.shieldT > 0 && r.armorAfterHit === r.armorFull && r.hpAfterHit === r.hpFull, what: 'giáp đầy + khiên chặn sát thương' },
    elves: { chk: r => r.critT > 0 && r.critBonus === 25, what: '+25 chí mạng' },
    werewolf: { chk: r => r.hpAfter - r.hpBefore === 10 && r.buffT > 0, what: 'hồi 10 + sát thương x1,5' },
    priest: { chk: r => r.hpAfter - r.hpBefore === 11, what: 'hồi 11 cho đội' },
    robot: { chk: r => r.kinds.drone === 4, what: '4 drone' },
    viking: { chk: r => r.buffT > 0 && r.dmgMul === 1.5, what: 'Weapon Boost x1,5' },
    necromancer: { chk: r => r.kinds.undead === 1, what: 'hồi sinh quái làm đồng minh' },
    officer: { chk: r => r.eHp0 - r.eHp1 >= 12, what: 'không kích 12 sát thương' },
    taoist: { chk: r => r.bulletKilled && r.zones >= 1, what: 'kiếm bay chặn đạn' }
  };
  const UPCASE = {
    ranger: { chk: r => r.eHp0 - r.eHp1 >= 60, what: 'Iaido 10 nhát' },
    paladin: { chk: r => r.shieldT > 3, what: 'khiên 4 s' },
    elves: { chk: r => r.critT > 5, what: 'chí mạng 10 s' },
    robot: { chk: r => r.kinds.drone === 6, what: '6 drone' },
    assassin: { chk: r => r.kinds.clone === 2, what: '2 phân thân' }
  };
  async function runSkill(hero, up) {
    await setTeam([{ hero, up }]);
    await ev(h => { const G = SK.G, t = G.troop, rec = t.recs[0]; if (h === 'priest') rec.hp = 10; if (h === 'werewolf') rec.hp = 10; if (h === 'paladin') { rec.armor = 1; } }, hero);
    await foe(26, 0, 5000, { freeze: false });
    if (hero === 'necromancer') await ev(() => { const G = SK.G, e = G.enemies[G.enemies.length - 1]; const id = G.map.th.enemies.filter(id => SK.D.enemies[id])[0]; const w = SK.makeEnemy(G, id, e.x + 60, e.y, G.room || G.map.rooms[0]); w.hp = w.hpMax = 1; w.st = 'idle'; w.spawnT = 0; G.enemies.push(w); SK.hurtEnemy(G, w, 9, false, 0, 0); });
    const r = await ev(async ({ hero, up }) => {
      const G = SK.G, rec = G.troop.recs[0], a = G.troop.allies.get(rec), e = G.enemies.find(q => q.hp > 100);
      const hpBefore = rec.hp, s = SK.troop.stat(rec), eHp0 = e.hp, u0 = window.__tp.skill; let stunSeen = false;
      a.skCd = 0;
      if (hero === 'paladin') { /* khiên rồi bị đánh */ }
      const t0 = performance.now(); let used = false, tUsed = 0, bulletKilled = false, bl = null, armorAfterHit = null, hpAfterHit = null;
      while (performance.now() - t0 < 6000) {
        await new Promise(r => setTimeout(r, 60));
        if (e.st === 'stun' && e.hp < eHp0) stunSeen = true;
        if (!used && window.__tp.skill > u0) {
          used = true; tUsed = performance.now();
          if (hero === 'taoist') { bl = { side: 'e', x: a.x + 8, y: a.y - 6, vx: 0, vy: 0, r: 2, h: 6, dmg: 1, life: 5, t: 0 }; G.bullets.push(bl); }
          if (hero === 'paladin') { a.hp -= 7; armorAfterHit = rec.armor; hpAfterHit = rec.hp; }
        }
        if (used && performance.now() - tUsed > (hero === 'officer' || hero === 'alchemist' || hero === 'vampire' ? 2200 : 400)) break;
      }
      if (bl) bulletKilled = !!bl.dead || G.bullets.indexOf(bl) < 0;
      const kinds = {}; for (const w of SK.weaponAllies(G)) if (w.kind && !w.gone) kinds[w.kind] = (kinds[w.kind] || 0) + 1;
      return { used, buffT: a.buffT, dmgMul: a.dmgMul, critT: a.critT, critBonus: a.critBonus, shieldT: a.shieldT, eHp0, eHp1: e.hp, eStunSeen: stunSeen, kinds,
        zones: G.props.filter(pr => pr.tr2).length, armorFull: s.armor, hpFull: s.hp, armorAfterHit, hpAfterHit, hpBefore, hpAfter: rec.hp, bulletKilled };
    }, { hero, up });
    return r;
  }
  const skillRes = [];
  for (const hero of Object.keys(SKILLCASE)) {
    const r = await runSkill(hero, false);
    const ok = r.used && SKILLCASE[hero].chk(r);
    skillRes.push((ok ? '' : '!') + hero);
    check('kỹ năng lính ' + hero + ': ' + SKILLCASE[hero].what, ok, JSON.stringify(r));
  }
  for (const hero of Object.keys(UPCASE)) {
    const r = await runSkill(hero, true);
    check('kỹ năng lính bản nâng ' + hero + ': ' + UPCASE[hero].what, r.used && UPCASE[hero].chk(r), JSON.stringify(r));
  }
  check('Tu Sĩ Rừng không có kỹ năng (hồi chiêu vô hạn)', (await ev(() => SK.troop.HEROSKILL.druid)) === undefined);
  const noMulti = await ev(() => SK.TROOP.ids.every(h => h === 'druid' || SK.troop.HEROSKILL[h]));
  check('16 anh hùng còn lại đều có kỹ năng', noMulti);
  await p.screenshot({ path: path.join(SHOTS, '6-skill.png') });

  // ---- 7. Còi: Tập hợp / Hành động đổi hành vi lính
  await stageTo('1-1');
  const whistle = async gather => {
    await setTeam([{ hero: 'viking' }]);   // cận chiến (rìu)
    await ev(g => {
      const G = SK.G, t = G.troop, pl = G.player, U = SK.PPU; t.gather = g;
      const a = [...t.allies.values()][0]; a.x = pl.x + 2.5 * U; a.y = pl.y; a.skCd = 9999;
      const id = G.map.th.enemies.filter(id => SK.D.enemies[id])[0];
      const e = SK.makeEnemy(G, id, a.x + 5 * U, a.y, G.room || G.map.rooms[0]); e.hp = e.hpMax = 9999; e.st = 'stun'; e.stT = 999; e.spawnT = 0; G.enemies.push(e);
    }, gather);
    await sleep(1800);
    return ev(() => { const G = SK.G, pl = G.player, a = [...G.troop.allies.values()][0]; return { dp: Math.hypot(a.x - pl.x, a.y - pl.y) / SK.PPU, e: G.enemies[G.enemies.length - 1].hp }; });
  };
  const wFree = await whistle(false), wGather = await whistle(true);
  check('Còi Hành động: lính cận chiến đuổi quái xa (cách pet > 5 đv, đánh trúng quái)', wFree.dp > 5 && wFree.e < 9999, JSON.stringify(wFree));
  check('Còi Tập hợp: lính về cạnh pet (cách <= 4,2 đv) và không rời pet đuổi quái', wGather.dp <= 4.2 && wGather.e === 9999, JSON.stringify(wGather));
  await ev(() => { SK.G.troop.gather = false; });
  await p.keyboard.press('KeyL'); await sleep(150);
  check('nút đặc biệt (L) đổi Còi sang Tập hợp rồi lại Hành động', (await ev(() => SK.G.troop.gather)) === true && (await (async () => { await p.keyboard.press('KeyL'); await sleep(150); return ev(() => SK.G.troop.gather); })()) === false);

  // ---- 8. 5 ô vũ khí pet và 4 vũ khí pet (bấm tay thật: K đổi vũ khí, J dùng)
  await ev(() => { const G = SK.G, t = G.troop; t.pack = ['troop_bite', 'troop_heal']; t.cur = 0; SK.troop.setWeapon(G, 'troop_bite'); G.player.skillCd = 0; });
  await p.keyboard.press('KeyK'); await sleep(200);
  check('nút kỹ năng (K) đổi vũ khí pet: Cắn -> Túi Chữa Trị', (await ev(() => SK.G.player.weapons[0].id)) === 'troop_heal');
  r = await ev(() => { const t = SK.G.troop, out = []; for (const id of ['troop_ice', 'troop_shield', 'troop_reborn', 'troop_ice']) out.push(SK.troop.addWeapon(SK.G, id).ok); out.push(SK.troop.addWeapon(SK.G, 'weapon_001').ok); return { out, n: t.pack.length, pack: t.pack.join(',') }; });
  check('5 ô vũ khí pet: nhận đủ 5, ô thứ 6 và trùng bị từ chối (Còi không chiếm ô)', r.n === 5 && r.out.join() === 'true,true,true,false,false', JSON.stringify(r));
  // Pha Lê Đóng Băng
  await foe(0, 0, 5000, { fromPet: true, dx: 20, dy: 0 });
  await ev(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', x: pl.x + 22, y: pl.y - 6, vx: 0, vy: 0, r: 2, h: 6, dmg: 1, life: 9, t: 0, id: 'near' }, { side: 'e', x: pl.x + 70, y: pl.y - 6, vx: 0, vy: 0, r: 2, h: 6, dmg: 1, life: 9, t: 0, id: 'far' }); });
  const iceE0 = await ev(() => { const G = SK.G; G.player.energy = 160; G.player.weapons[0].cd = 0; return { en: G.player.energy, hp: G.enemies[G.enemies.length - 1].hp, st: G.enemies[G.enemies.length - 1].st }; });
  await ev(() => { const G = SK.G; SK.troop.setWeapon(G, 'troop_ice'); G.player.energy = 160; G.player.weapons[0].cd = 0; });
  await p.keyboard.down('KeyJ'); await sleep(300); await p.keyboard.up('KeyJ'); await sleep(200);
  const ice = await ev(() => { const G = SK.G, e = G.enemies[G.enemies.length - 1]; return { en: G.player.energy, hp: e.hp, st: e.st, near: G.bullets.some(b => b.id === 'near' && !b.dead), far: G.bullets.some(b => b.id === 'far' && !b.dead) }; });
  check('Pha Lê Đóng Băng: trừ 50 NL, quái cạnh pet mất 3 máu và bị đóng băng, đạn gần bị phá, đạn xa còn', ice.en === 110 && 5000 - ice.hp === 3 && ice.st === 'stun' && !ice.near && ice.far, JSON.stringify({ iceE0, ice }));
  // Túi Chữa Trị
  await setTeam([{ hero: 'knight' }, { hero: 'mage' }]);
  await ev(() => { const G = SK.G; for (const r of G.troop.recs) { r.hp -= 20; r.armor = 0; } SK.troop.setWeapon(G, 'troop_heal'); G.player.energy = 160; G.player.weapons[0].cd = 0; });
  await p.keyboard.down('KeyJ'); await sleep(250); await p.keyboard.up('KeyJ'); await sleep(100);
  const hl = await ev(() => ({ en: SK.G.player.energy, r: SK.G.troop.recs.map(r => [r.hp, r.armor]) }));
  check('Túi Chữa Trị (bấm J): trừ 60 NL, mọi lính +10 HP +5 giáp', hl.en === 100 && JSON.stringify(hl.r) === '[[50,5],[30,5]]', JSON.stringify(hl));
  // Máy Tạo Lực Trường
  await ev(() => { const G = SK.G, pl = G.player; G.bullets.length = 0; SK.troop.setWeapon(G, 'troop_shield'); pl.energy = 160; pl.weapons[0].cd = 0; });
  await p.keyboard.down('KeyJ'); await sleep(250); await p.keyboard.up('KeyJ');
  await ev(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', x: pl.x + 20, y: pl.y - 6, vx: 0, vy: 0, r: 2, h: 6, dmg: 1, life: 9, t: 0, id: 'in' }, { side: 'e', x: pl.x + 90, y: pl.y - 6, vx: 0, vy: 0, r: 2, h: 6, dmg: 1, life: 9, t: 0, id: 'out' }); });
  await sleep(300);
  const sh = await ev(() => { const G = SK.G; return { en: G.player.energy, inn: G.bullets.some(b => b.id === 'in' && !b.dead), out: G.bullets.some(b => b.id === 'out' && !b.dead), zones: G.props.filter(pr => pr.tr2).length }; });
  check('Máy Tạo Lực Trường: trừ 70 NL, đạn vào lục giác bị chặn, đạn ngoài còn', sh.en === 90 && !sh.inn && sh.out && sh.zones >= 1, JSON.stringify(sh));
  await sleep(4000);
  await ev(() => { const G = SK.G; G.bullets.push({ side: 'e', x: G.player.x + 20, y: G.player.y - 6, vx: 0, vy: 0, r: 2, h: 6, dmg: 1, life: 9, t: 0, id: 'late' }); });
  await sleep(500);
  const sh2 = await ev(() => { const G = SK.G; return { late: G.bullets.some(b => b.id === 'late' && !b.dead), zones: G.props.filter(pr => pr.tr2).length }; });
  check('lực trường hết sau 4 s (đạn lọt qua, vùng biến mất)', sh2.late && sh2.zones === 0, JSON.stringify(sh2));
  // Máy Hồi Sức Tim Phổi
  await setTeam([{ hero: 'knight' }, { hero: 'mage' }]);
  await ev(() => { const G = SK.G; SK.troop.setWeapon(G, 'troop_reborn'); G.player.energy = 160; G.player.weapons[0].cd = 0; });
  await p.keyboard.down('KeyJ'); await sleep(250); await p.keyboard.up('KeyJ'); await sleep(200);
  const rb0 = await ev(() => ({ en: SK.G.player.energy }));
  check('Máy Hồi Sức khi không ai gục: hoàn lại NL (160)', rb0.en === 160, JSON.stringify(rb0));
  await ev(() => { const G = SK.G, a = G.troop.allies.get(G.troop.recs[1]); G.bullets.push({ side: 'e', x: a.x, y: a.y - 7, vx: 0, vy: 0, r: 2, h: 6, dmg: 5000, life: 2, t: 0 }); });
  await until(p, () => SK.G.troop.recs.some(r => r.dead), null, 5000);
  const rbDead = await ev(() => SK.G.troop.recs.findIndex(r => r.dead));
  await ev(() => { const G = SK.G; G.player.energy = 160; G.player.weapons[0].cd = 0; });
  await p.keyboard.down('KeyJ'); await sleep(250); await p.keyboard.up('KeyJ');
  const rbMid = await ev(() => SK.G.troop.recs.some(r => r.dead));
  await until(p, () => !SK.G.troop.recs.some(r => r.dead), null, 6000); await sleep(100);
  const rb = await ev(i => { const r = SK.G.troop.recs[i], s = SK.troop.stat(r); return { en: SK.G.player.energy, hp: r.hp, ar: r.armor, dead: r.dead, fullHp: s.hp, fullAr: s.armor, living: SK.G.troop.allies.size }; }, rbDead);
  check('Máy Hồi Sức Tim Phổi: trừ 100 NL, niệm 1 s rồi lính gục sống lại đầy HP và giáp, có thân xác', rbDead >= 0 && rbMid && !rb.dead && rb.hp === rb.fullHp && rb.ar === rb.fullAr && rb.en <= 70 && rb.living === 2, JSON.stringify({ rbDead, rbMid, rb }));
  await p.screenshot({ path: path.join(SHOTS, '8-petskills.png') });

  // ---- 9. quầy rượu, Tư Chất, Mực Xào, đưa vũ khí, thùng rác
  await stageTo('1-1');
  await setTeam([{ hero: 'knight' }, { hero: 'mage' }]);
  const bar0 = await ev(() => ({ n: SK.G.troop.bar.length, kinds: SK.G.troop.bar.map(b => b.kind).join(), labels: SK.G.interactables.filter(o => o.tr).map(o => o.label).filter(l => /uống|Mua |Tư Chất|Mực Xào|Phục vụ|Thùng rác|Đưa /.test(l)) }));
  check('căn cứ có quầy rượu: 2 thức uống, 1 vũ khí, Tư Chất, Mực Xào, Phục vụ, thùng rác', bar0.kinds === 'drink,drink,weapon,book,squid' && bar0.labels.length >= 7, JSON.stringify(bar0));
  await p.screenshot({ path: path.join(SHOTS, '9-bar.png') });
  const drinks = await ev(() => {
    const G = SK.G, t = G.troop, out = {}, T = SK.troop; t.coins = 100;
    const rec = () => T.target(G);
    for (const k of Object.keys(SK.TROOP.DRINKS)) {
      t.bar = [{ kind: 'drink', id: k, price: 2 }]; const r0 = rec(), s0 = T.stat(r0), hp0 = r0.hp, ar0 = r0.armor, c0 = t.coins, cd0 = r0.cdCut || 0, rate0 = r0.rate || 1;
      const res = T.buy(G, 0), s1 = T.stat(r0);
      out[k] = { ok: res.ok, paid: c0 - t.coins, dHp: s1.hp - s0.hp, dHpNow: r0.hp - hp0, dAr: s1.armor - s0.armor, dDef: s1.def - s0.def, dCrit: s1.crit - s0.crit, dRate: Math.round(((r0.rate || 1) - rate0) * 100), dCd: Math.round(((r0.cdCut || 0) - cd0) * 100), hero: r0.hero, sold: t.bar[0].sold };
    }
    return out;
  });
  const d = drinks;
  check('thức uống trừ đúng 2 xu mỗi ly', Object.values(d).every(x => x.ok && x.paid === 2 && x.sold), JSON.stringify(d));
  check('Rượu +10 HP, Nước Dừa +4 giáp, Sữa +1 Phòng Thủ, Bloody Mary +8 chí mạng, Cà Phê +10% công tốc, Soda -10% hồi chiêu',
    d.wine.dHp === 10 && d.wine.dHpNow === 10 && d.coconut.dAr === 4 && d.milk.dDef === 1 && d.bloody.dCrit === 8 && d.coffee.dRate === 10 && d.soda.dCd === 10, JSON.stringify(d));
  // Phòng Thủ 1 giảm sát thương mỗi đòn: rec đã uống sữa
  const milkTest = await ev(() => { const G = SK.G, T = SK.troop, rec = G.troop.recs.find(r => r.def === 1), a = T.allyOf(G, rec); rec.armor = 0; const h0 = rec.hp; a.hp -= 5; return { dHp: h0 - rec.hp }; });
  check('Phòng Thủ +1 từ Sữa: đòn 5 sát thương chỉ mất 4 máu', milkTest.dHp === 4, JSON.stringify(milkTest));
  // 10 ly cho một lính -> mục tiêu Bạc "Cạn ly"
  await ev(() => { SK.troop.profReset(); });
  const cheers = await ev(() => { const G = SK.G, t = G.troop, T = SK.troop; t.coins = 100; const rec = T.target(G); rec.drinks = 0; for (let i = 0; i < 10; i++) { t.bar = [{ kind: 'drink', id: 'coconut', price: 2 }]; T.buy(G, 0); } return { drinks: rec.drinks, goal: SK.troop.prof.goals.cheers, saved: JSON.parse(localStorage.getItem('sk.troop.v1')).goals.cheers }; });
  check('cho 1 lính uống 10 ly: ghi mục tiêu "Cạn ly" vào hồ sơ sk.troop.v1', cheers.drinks === 10 && cheers.goal === 1 && cheers.saved === 1, JSON.stringify(cheers));
  // vũ khí quầy trừ đúng giá theo phẩm
  const wbuy = await ev(() => {
    const G = SK.G, t = G.troop, T = SK.troop, res = [], ids = {}; t.pack = ['troop_bite', 'troop_heal']; t.coins = 50;
    for (const gr of [1, 2, 3, 4]) { const id = Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].grade === gr && !/^troop_/.test(k) && SK.DS.weapons[k].kind); ids[gr] = id; }
    t.pack = ['troop_bite']; for (const gr of [1, 2, 3, 4]) { t.bar = [{ kind: 'weapon', id: ids[gr], price: SK.TROOP.BAR.weapon[gr - 1] }]; const c0 = t.coins, r = T.buy(G, 0); res.push([gr, c0 - t.coins, r.ok]); }
    return { res, pack: t.pack.length, ids };
  });
  check('vũ khí quầy rượu: Thường 0, Hiếm 1, Rất Hiếm 2, Sử Thi 3 xu; vào ô vũ khí pet', JSON.stringify(wbuy.res) === '[[1,0,true],[2,1,true],[3,2,true],[4,3,true]]' && wbuy.pack === 5, JSON.stringify(wbuy));
  // đưa vũ khí cho lính: phẩm vượt cap bị từ chối, Tư Chất nâng cap, vũ khí đỏ cho được
  const give = await ev(() => {
    const G = SK.G, t = G.troop, T = SK.troop, out = {}; t.coins = 50;
    const redId = Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].grade >= 6 && SK.DS.weapons[k].kind && SK.DS.weapons[k].kind !== 'troop'), rec = T.target(G);
    t.pack = ['troop_bite', 'troop_heal', redId]; out.redId = redId; out.hero = rec.hero;
    let r = T.giveWeapon(G); out.refused = !r.ok && /không thể trang bị/.test(r.why); out.packKept = t.pack.length === 3;
    for (let i = 0; i < 3; i++) { t.bar = [{ kind: 'book', price: 1 }]; const c0 = t.coins; const b = T.buy(G, 0); out['book' + i] = [b.ok, c0 - t.coins, rec.cap]; }
    t.bar = [{ kind: 'book', price: 1 }]; out.bookMax = !T.buy(G, 0).ok;
    r = T.giveWeapon(G); out.given = r.ok && rec.weapon === redId && t.pack.length === 2; out.red = SK.troop.prof.goals.red;
    return out;
  });
  check('đưa Vũ Khí Đỏ khi phẩm tối đa là lam bị từ chối ("không thể trang bị")', give.refused && give.packKept, JSON.stringify(give));
  check('Tư Chất Lính Thuê: 1 xu, phẩm tối đa 4 -> 5 -> 6, đạt tối đa thì từ chối; sau đó đưa được Vũ Khí Đỏ và ghi mục tiêu Đồng', give.book0.join() === 'true,1,4' && give.book1.join() === 'true,1,5' && give.book2.join() === 'true,1,6' && give.bookMax && give.given && give.red === 1, JSON.stringify(give));
  // lính dùng vũ khí được đưa: knight (cận chiến) cầm súng thì sinh đạn
  const gunId = await ev(() => Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].kind === 'gun' && SK.DS.weapons[k].grade <= 3 && SK.DS.weapons[k].dmg >= 2));
  await setTeam([{ hero: 'knight' }]);
  await foe(110, 0, 9999, { freeze: true });
  const before = await ev(() => { const G = SK.G; const a = [...G.troop.allies.values()][0]; a.skCd = 9999; return G.bullets.filter(b => b.side === 'p' && b.owner === a).length; });
  await ev(g => { const G = SK.G; G.troop.recs[0].weapon = g; }, gunId);
  let shot = false; for (let i = 0; i < 40 && !shot; i++) { await sleep(100); shot = await ev(() => { const G = SK.G, a = [...G.troop.allies.values()][0]; return G.bullets.some(b => b.side === 'p' && b.owner === a); }); }
  check('lính cầm vũ khí được đưa (súng) thì bắn đạn, không còn cận chiến của Kỵ Sĩ', before === 0 && shot, 'gun ' + gunId);
  // vũ khí pet đưa rơi lại khi hợp nhất / Mực Xào
  const sq = await ev(() => {
    const G = SK.G, t = G.troop, T = SK.troop, out = {}; t.recs.length = 0; for (const h of ['knight', 'mage']) { const r = T.newRec(h); t.recs.push(r); } t.recs[1].weapon = 'weapon_001'; T.respawn(G);
    t.pack = ['troop_bite', 'troop_heal']; t.coins = 7;
    const a1 = T.allyOf(G, t.recs[0]), a2 = T.allyOf(G, t.recs[1]), pl = G.player; a1.x = pl.x + 200; a2.x = pl.x + 2; a2.y = pl.y; // mage gần pet nhất
    t.bar = [{ kind: 'squid', price: 0 }]; const c0 = t.coins, r = T.buy(G, 0);
    out.res = { ok: r.ok, paid: c0 - t.coins, n: t.recs.length, left: t.recs.map(q => q.hero).join(), pack: t.pack.join(), fired: SK.troop.prof.goals.fired };
    t.bar = [{ kind: 'squid', price: 0 }]; const r2 = T.buy(G, 0); out.last = { ok: r2.ok, n: t.recs.length, why: r2.why };
    return out;
  });
  check('Mực Xào: 0 xu, sa thải lính gần pet nhất (Pháp Sư), vũ khí rơi về ô pet, ghi mục tiêu "Bạn đã bị sa thải"', sq.res.ok && sq.res.paid === 0 && sq.res.n === 1 && sq.res.left === 'knight' && /weapon_001/.test(sq.res.pack) && sq.res.fired === 1, JSON.stringify(sq));
  check('Mực Xào bị chặn khi chỉ còn 1 lính', !sq.last.ok && sq.last.n === 1, JSON.stringify(sq.last));
  // làm mới quầy, thùng rác bấm E thật
  await ev(() => { const t = SK.G.troop; t.coins = 5; t.pack = ['troop_bite', 'troop_heal', 'weapon_001']; });
  lbl = await useLabel('^Thùng rác: bỏ');
  q = await ev(() => ({ pack: SK.G.troop.pack.join() }));
  check('thùng rác (bấm E): bỏ vũ khí mang theo, không đụng vũ khí pet', /Thùng rác: bỏ/.test(lbl || '') && q.pack === 'troop_bite,troop_heal', lbl + ' · ' + q.pack);
  const bar1 = await ev(() => SK.G.troop.bar.map(b => b.kind + (b.id || '')).join());
  lbl = await useLabel('^Phục vụ');
  const bar2 = await ev(() => ({ b: SK.G.troop.bar.map(b => b.kind + (b.id || '')).join(), c: SK.G.troop.coins }));
  check('Phục vụ (bấm E): làm mới quầy rượu, trừ 1 xu', bar2.c === 4 && bar2.b.indexOf('book') > 0, JSON.stringify({ bar1, bar2 }));

  // ---- 10. cúp Đồng / Bạc / Vàng
  await ev(() => { SK.troop.profReset(); });
  const tr0 = await ev(() => {
    const G = SK.G, t = G.troop, T = SK.troop, P = T.prof; const out = {};
    t.coins = 999; t.flag = 5;
    for (const h of SK.TROOP.ids) { t.recs.length = 0; for (let i = 0; i < 3; i++) T.hire(G, h); }   // 3 lần thuê cùng loại = hợp nhất
    out.hired = Object.keys(P.hired).length; out.up = Object.keys(P.up).length;
    t.recs.length = 0; t.recs.push(T.newRec('knight'), T.newRec('mage')); T.respawn(G);
    t.stock = ['mage', 'mage', 'mage']; T.checkRow(G); out.row = P.goals.row;
    out.before = T.trophyState();
    // Mực Xào + Vũ Khí Đỏ
    t.recs[0].cap = 6; const redId = Object.keys(SK.DS.weapons).find(k => SK.DS.weapons[k].grade >= 6 && SK.DS.weapons[k].kind && SK.DS.weapons[k].kind !== 'troop');
    t.pack = ['troop_bite', redId]; const a = T.allyOf(G, t.recs[0]), pl = G.player; a.x = pl.x + 1; T.giveWeapon(G); t.bar = [{ kind: 'squid', price: 0 }]; a.x = pl.x + 1; T.target(G); T.buy(G, 0);
    out.after = T.trophyState(); out.goals = Object.assign({}, P.goals);
    return out;
  });
  check('mục tiêu Đồng: thuê đủ 17 loại, 3 giống nhau khi làm mới, Mực Xào, Vũ Khí Đỏ -> cúp Đồng chỉ khi đủ cả 4', tr0.hired === 17 && tr0.row === 1 && !tr0.before.bronze && tr0.after.bronze && !tr0.after.silver && !tr0.after.gold, JSON.stringify(tr0));
  check('hợp nhất cả 17 loại ghi đủ 17 bản nâng (mục tiêu Bạc "mở mọi bản nâng")', tr0.up === 17, 'up ' + tr0.up);
  // thắng thật: chuẩn bị hồ sơ gần đủ rồi thắng ván thật để ghi cúp
  await ev(() => { const P = SK.troop.prof; for (const h of SK.TROOP.ids) { if (h !== 'knight') { P.won[h] = 1; P.goldUp[h] = 1; } } P.goals.cheers = 1; P.trophies = {}; SK.troop.profSave(); });
  await freshRun();
  await ev(() => { const G = SK.G, r = G.troop.recs[0]; G.badass = true; r.up = true; r.bHp = 99999; r.hp = 99999; G.troop.coins = 0; });   // lính không chết giữa trùm để ván thắng thật
  await stageTo('3-5', 'boss');
  await until(p, () => SK_GAME.rooms.some(r => r.type === 'boss' && r.state === 'locked'), null, 8000);
  await ev(() => SK_GAME.debug.clearRoom());
  await until(p, () => !!SK.G.portal, null, 8000);
  await ev(() => { const G = SK.G, pl = G.player; pl.x = G.portal.x; pl.y = G.portal.y; });
  await ev(() => { window.__runEndWon = 'chưa phát'; SK.on('runEnd', (G, r) => { window.__runEndWon = r.won; }); });
  let won = false;
  for (let i = 0; i < 60 && !won; i++) {   // cổng cuối mở bảng chọn buff (giữ ván): bấm phím 1 như người chơi
    if (await ev(() => !!SK.G.hold)) { await p.keyboard.press('Digit1'); await sleep(150); }
    won = await ev(() => SK_GAME.state === 'victory'); if (!won) await sleep(150);
  }
  await sleep(300);
  check('runEnd của ván thắng thật báo won = true (game.js fillEnd)', await ev(() => window.__runEndWon === true), await ev(() => window.__runEndWon));
  const trw = await ev(() => ({ info: document.getElementById('sk-win-info').textContent, last: SK.G.troop.lastTrophy, saved: JSON.parse(localStorage.getItem('sk.troop.v1')).trophies, same: SK.troop.prof.goals.same }));
  check('thắng thật 3-5 (Lợi Hại, lính bản nâng, chỉ 1 loại): ghi mục tiêu Vàng và Bạc, đủ cúp Đồng/Bạc/Vàng vào hồ sơ', won && trw.last.won && trw.last.trophies.bronze && trw.last.trophies.silver && trw.last.trophies.gold && trw.saved.gold && trw.same === 1, JSON.stringify(trw.last) + ' ' + JSON.stringify(trw.saved));
  check('cuối ván hiện cúp đã đạt', /Cúp: Đồng, Bạc, Vàng/.test(trw.info), trw.info);
  await p.screenshot({ path: path.join(SHOTS, '10-win.png') });
  await ev(() => { SK.troop.profReset(); });

  console.log(results.join('\n'));
  console.log('\nlỗi trang: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'không'));
  check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
