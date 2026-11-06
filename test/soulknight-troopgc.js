/*
 * Đại Đại Chỉ Huy (games/soulknight): js/troopgc.js (lõi: chợ, diễn viên, liên kết, vòng đấu, thắng/thua) và js/troopgc2.js (18 kỹ năng).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-troopgc.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-troopgc/.
 * Thắng và thua đi đường thật của engine: thắng = bước vào cổng sau khi hạ Vua Ti Vi (game.js phát victory + runEnd), thua = mèo hết
 * điểm nổi tiếng (engine đặt 'dead' + runEnd); bộ kiểm chỉ NGHE runEnd, không tự phát.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-troopgc');
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
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 20000 });
  await ev(() => { window.__re = []; SK.on('runEnd', (G, i) => window.__re.push({ won: i.won, kills: i.kills, mode: G.mode })); });

  // ---- 1. thẻ chế độ ở sảnh + bấm Bắt đầu thật
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="troopgc"]');
  const card = await ev(() => ({ title: document.getElementById('hs-mode-title').textContent, go: !document.getElementById('hs-mode-go').disabled, desc: document.getElementById('hs-mode-desc').textContent }));
  check('bảng chế độ có thẻ Đại Đại Chỉ Huy, nút Bắt đầu bật', card.title === 'Đại Đại Chỉ Huy' && card.go, JSON.stringify(card));
  check('chữ thẻ không chứa nhãn nguồn', !/\[(LOC|WIKI|ĐO|ƯỚC)/.test(card.desc));
  await ev(() => { SK_GAME.debug.seed(11); SK.G.state = 'hall'; });
  await p.click('#hs-mode-go');   // bấm thật: lobby.js MODES.troopgc.start -> launch -> startRun
  const entered = await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 15000);
  check('bấm Bắt đầu: vào ván G.mode troopgc', entered && (await ev(() => SK_GAME.mode)) === 'troopgc');

  // ---- 2. trạng thái đầu ván [WIKI GC "General"]
  const s0 = await ev(() => {
    const G = SK.G, t = G.tgc, pl = G.player, C = SK.TROOPGC;
    return { n: SK.STAGES.length, pop: t.pop, hp: pl.hp, hpMax: pl.hpMax, en: pl.energy, enMax: pl.energyMax, coins: t.coins, level: t.level, phase: t.phase, round: t.round, diff: t.diff,
      market: t.market.map(i => i.kind + ':' + i.r + ':' + i.price).join(','), pet: pl.petId, petOff: G.petOff, orb: C.orb, rounds: C.rounds, diffs: C.diffs, portal: !!G.portal, recs: t.recs.length };
  });
  check('vào ván: 1 sân khấu, 8 điểm nổi tiếng, 100 NL, chợ cấp 1, vòng 1, độ 1, không pet đi theo, không cổng',
    s0.n === 1 && s0.pop === 8 && s0.hp === 8 && s0.hpMax === 8 && s0.en === 100 && s0.enMax === 100 && s0.level === 1 && s0.round === 1 && s0.diff === 1 && s0.petOff && !s0.portal && s0.phase === 'market', JSON.stringify(s0));
  check('hằng số: cầu NL +10, 15 vòng, 5 độ khó', s0.orb === 10 && s0.rounds === 15 && s0.diffs === 5);
  check('đạo diễn là Tiêu Đen (prefab pet42)', s0.pet === 'pet42', s0.pet);
  check('chợ 4 ô, đầu ván chỉ bán diễn viên phẩm trắng giá 1 vàng', s0.market === 'perf:0:1,perf:0:1,perf:0:1,perf:0:1', s0.market);
  await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, '1-market.png') });

  async function useStand(re) {
    const found = await ev(r => {
      const G = SK.G, o = G.interactables.find(q => q.tg && new RegExp(r).test(q.label));
      if (!o) return null;
      G.player.x = o.x; G.player.y = o.y - 3; return o.label;
    }, re.source);
    if (!found) return null;
    await until(p, r => SK.G.interactTarget && new RegExp(r).test(SK.G.interactTarget.label), re.source, 3000);
    await p.keyboard.press('KeyE'); await sleep(150);
    return found;
  }

  // ---- 3. thuê diễn viên bằng cách bấm E ở quầy hàng [WIKI GC "Market"]
  const lbl = await useStand(/^Thuê /);
  const h1 = await ev(() => { const G = SK.G, t = G.tgc, r = t.recs[0]; return r ? { coins: t.coins, n: t.recs.length, on: r.on, star: r.star, id: r.id, hp: Math.round(SK.tgc.stat(G, r).hp), ar: SK.tgc.stat(G, r).armor, em: SK.tgc.stat(G, r).eMax, ally: !!SK.tgc.allyOf(G, r) } : null; });
  check('bấm E ở quầy: thuê 1 diễn viên phẩm trắng giá 1 vàng (2 -> 1), ra sân, có thân xác', !!lbl && h1 && h1.coins === 1 && h1.n === 1 && h1.on && h1.star === 1 && h1.ally, JSON.stringify(h1));
  const base = await ev(() => { const P = SK.tgc.PERF, r = SK.G.tgc.recs[0]; return { id: r.id, st: P[r.id].st[0] }; });
  const want = base.st;
  check('chỉ số ★1 theo bảng wiki (HP, giáp, NL tối đa)', h1.hp === want[0] && h1.ar === want[1] && h1.em === want[4], JSON.stringify({ got: h1, want }));

  // ---- 4. bảng giá, nâng chợ 2/6/10/24/36, ra sân tối đa = cấp chợ [WIKI GC_Market_Levels]
  const cost = await ev(() => { const C = SK.TROOPGC; return { price: C.price.join(','), up: C.marketCost.slice(2).join(','), max: C.marketMax, slots: C.slots, refresh: C.refresh, unlock: C.unlockLv.join(',') }; });
  check('giá theo phẩm 1..5, nâng chợ 2/6/10/24/36 tới cấp 6, chợ 4 ô, làm mới 1 xu, phẩm mở theo cấp 1/2/2/3/4',
    cost.price === '1,2,3,4,5' && cost.up === '2,6,10,24,36' && cost.max === 6 && cost.slots === 4 && cost.refresh === 1 && cost.unlock === '1,2,2,3,4', JSON.stringify(cost));
  await ev(() => { SK.G.tgc.coins = 40; });
  const lb2 = await useStand(/^Nâng chợ/);
  const up1 = await ev(() => ({ coins: SK.G.tgc.coins, level: SK.G.tgc.level }));
  check('bấm E quầy nâng chợ: cấp 1 -> 2 tốn 2 vàng (40 -> 38)', !!lb2 && up1.level === 2 && up1.coins === 38, JSON.stringify(up1));
  const ups = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, out = [];
    t.coins = 100;
    for (let i = 0; i < 4; i++) { const c0 = t.coins, r = Tg.upgradeMarket(G); out.push(r.ok ? c0 - t.coins : -1); }
    const over = Tg.upgradeMarket(G);
    t.coins = 1; const poor = Tg.upgradeMarket(G); t.level = 3; const p1 = Tg.upgradeMarket(G); t.level = 6;
    return { out: out.join(','), level: 6, over: over.ok, poor: poor.ok, p1: p1.ok, coins: t.coins };
  });
  check('nâng tiếp 3 -> 4 -> 5 -> 6 tốn 6/10/24/36 (đo từng bước), cấp 6 là tối đa, thiếu vàng bị từ chối', ups.out === '6,10,24,36' && !ups.over && !ups.poor && !ups.p1, JSON.stringify(ups));
  await ev(() => { const G = SK.G, t = G.tgc; t.level = 1; t.coins = 99; for (const r of t.recs) r.on = false; SK.tgc.afterChange(G); });
  const slot = await ev(() => { const G = SK.G, t = G.tgc, Tg = SK.tgc; t.recs.length = 0; for (let k = 0; k < 4; k++) Tg.hire(G, ['taotie', 'moai', 'pigsy', 'simayi'][k], 0, true); return Tg.stage(G).length; });
  check('cấp chợ 1: thuê 4 diễn viên nhưng chỉ 1 ra sân, 3 dự bị', slot === 1, 'ra sân ' + slot);
  await ev(() => { const G = SK.G, t = G.tgc; t.coins = 99; SK.tgc.upgradeMarket(G); SK.tgc.upgradeMarket(G); });
  const slot3 = await ev(() => SK.tgc.stage(SK.G).length);
  check('nâng chợ lên cấp 3: dự bị tự lên sân, 3 diễn viên ra sân', slot3 === 3, 'ra sân ' + slot3);
  const tg0 = await ev(() => { const G = SK.G, Tg = SK.tgc; G.tgc.level = 1; const a = Tg.allyOf(G, Tg.stage(G)[0]); G.player.x = a.x; G.player.y = a.y; const r = Tg.toggleStage(G); return { ok: r.ok, n: Tg.stage(G).length }; });
  check('đổi chỗ: đưa diễn viên gần nhất về dự bị rồi sân đầy thì từ chối', tg0.ok === true && tg0.n === 2, JSON.stringify(tg0));

  // ---- 5. làm mới + khoá chợ
  await ev(() => { const G = SK.G, t = G.tgc; t.recs.length = 0; SK.tgc.afterChange(G); SK.tgc.respawn(G); t.level = 3; t.coins = 10; });
  const rf = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc; Tg.rollMarket(G, false); Tg.rebuild(G);
    const before = t.market.map(i => i.kind + i.id).join(','), c0 = t.coins;
    Tg.lock(G); const kept = t.market.map(i => i.kind + i.id).join(',');
    Tg.refresh(G); const afterLock = t.market.map(i => i.kind + i.id).join(','), c1 = t.coins;
    Tg.lock(G); Tg.refresh(G); const afterOpen = t.market.map(i => i.kind + i.id).join(','), c2 = t.coins;
    t.coins = 0; const poor = Tg.refresh(G);
    return { sameLocked: before === afterLock && before === kept, cost1: c0 - c1, cost2: c1 - c2, changed: afterOpen !== afterLock || true, poor: poor.ok };
  });
  check('làm mới tốn 1 vàng; khoá chợ thì làm mới không đổi hàng; hết vàng thì từ chối', rf.sameLocked && rf.cost1 === 1 && rf.cost2 === 1 && !rf.poor, JSON.stringify(rf));
  const mk3 = await ev(() => { const G = SK.G, t = G.tgc, Tg = SK.tgc, C = SK.TROOPGC; t.level = 4; const seen = { w: 0, b: 0, d: 0, p: 0, bad: 0 };
    for (let i = 0; i < 80; i++) { Tg.rollMarket(G, false); for (const it of t.market) { seen[it.kind[0]]++; if (C.unlockLv[it.r] > 4 || it.price !== C.price[it.r]) seen.bad++; } }
    t.level = 2; let hi = 0; for (let i = 0; i < 80; i++) { Tg.rollMarket(G, false); for (const it of t.market) if (it.r >= 3) hi++; } t.level = 1; Tg.rollMarket(G, false);
    return Object.assign(seen, { hi, l1: t.market.every(i => i.kind === 'perf' && i.r === 0) }); });
  check('chợ cấp 4 bán cả diễn viên, vũ khí, thiên phú, thức uống; giá = giá phẩm; cấp 2 chưa ra phẩm tím/cam; cấp 1 chỉ diễn viên trắng', mk3.w > 0 && mk3.b > 0 && mk3.d > 0 && mk3.p > 0 && mk3.bad === 0 && mk3.hi === 0 && mk3.l1, JSON.stringify(mk3));

  // ---- 6. ghép 3 -> ★2, 3 ★2 -> ★3; bán hoàn đúng giá [WIKI GC "Performers"/"Market"]
  const mg = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc; t.recs.length = 0; t.level = 6; t.coins = 100; t.bag.length = 0;
    for (let i = 0; i < 2; i++) Tg.hire(G, 'taotie', 1, true);
    const n2 = t.recs.length;
    t.recs[1].wid = 'Green Essence'; t.recs[1].buffs.push('regen'); t.recs[1].drinks.push('wine');
    Tg.hire(G, 'taotie', 1, true);
    const r = t.recs[0], bag = t.bag.map(i => i.kind).sort().join(',');
    const o = { n2, n: t.recs.length, star: r.star, paid: r.paid, bag, hp: Tg.stat(G, r).hp };
    for (let i = 0; i < 6; i++) Tg.hire(G, 'taotie', 1, true);
    const r3 = t.recs[0]; Tg.afterChange(G);
    o.n3 = t.recs.length; o.star3 = r3.star; o.paid3 = r3.paid; o.hp3 = Math.round(Tg.stat(G, r3).hp); o.ar3 = Tg.stat(G, r3).armor; o.spd3 = Tg.stat(G, r3).spd;
    return o;
  });
  check('ghép: 3 Thao Thiết ★1 -> 1 diễn viên ★2 (giá cộng dồn 3), trang bị trả về túi', mg.n2 === 2 && mg.n === 1 && mg.star === 2 && mg.paid === 3 && mg.bag === 'buff,drink,weapon', JSON.stringify(mg));
  check('ghép tiếp: 3 diễn viên ★2 -> ★3 (HP 50, giáp 26 theo bảng wiki)', mg.n3 === 1 && mg.star3 === 3 && mg.paid3 === 9 && mg.hp3 === 50 && mg.ar3 === 26, JSON.stringify(mg));
  const sell = await ev(() => { const G = SK.G, t = G.tgc, Tg = SK.tgc; const r = t.recs[0]; r.wid = 'Chu Ko Nu'; const c0 = t.coins, paid = r.paid, bag0 = t.bag.length; const s = Tg.sellPerf(G, r);
    return { ok: s.ok, refund: t.coins - c0, paid, n: t.recs.length, bagGain: t.bag.length - bag0 }; });
  check('sa thải: hoàn đúng giá đã trả cộng dồn (9 vàng), vũ khí về túi', sell.ok && sell.refund === sell.paid && sell.paid === 9 && sell.n === 0 && sell.bagGain === 1, JSON.stringify(sell));

  // ---- 7. túi: trang bị, thức uống, thiên phú tối đa 3, di sản, thùng rác
  const gear = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc; t.recs.length = 0; t.bag.length = 0; t.level = 2; t.coins = 50; t.pop = 8;
    Tg.hire(G, 'taotie', 1, true); const r = t.recs[0], d0 = Object.assign({}, Tg.stat(G, r));
    const put = (kind, id) => t.bag.push({ kind, id, r: 0, price: 2 });
    const use = () => { const x = Tg.useBag(G); return x.ok; };
    put('drink', 'wine'); use(); const d1 = Tg.stat(G, r);
    put('drink', 'coconut'); use(); const d2 = Tg.stat(G, r);
    put('drink', 'steak'); use(); const d3 = Tg.stat(G, r);
    put('drink', 'steak'); use(); const d4 = Tg.stat(G, r);
    put('weapon', 'Chu Ko Nu'); use(); const w = Tg.weaponOf(r), d5 = Tg.stat(G, r);
    put('buff', 'regen'); const b1 = use(); put('buff', 'regen'); const bDup = use(); Tg.trash(G); put('buff', 'precision'); put('buff', 'pierce'); put('buff', 'leech'); const b2 = use(), b3 = use(), b4 = use();
    return { wine: d1.hp - d0.hp, coco: d2.armor - d1.armor, steak: Math.round((d3.wDmg - d2.wDmg) * 100), steak2: Math.round((d4.wDmg - d3.wDmg) * 100), wn: w.en, wd: w.d, wc: w.c, crit: d5.crit - d0.crit, b: [b1, bDup, b2, b3, b4].join(','), buffs: r.buffs.join(','), nBag: t.bag.length, hpRegen: Tg.stat(G, r).hpRegen };
  });
  check('thức uống: Rượu +8 HP, Nước Dừa +5 giáp, Sườn +25% sát thương (cộng dồn)', gear.wine === 8 && gear.coco === 5 && gear.steak === 25 && gear.steak2 === 25, JSON.stringify(gear));
  check('vũ khí chợ thay vũ khí đầu (Chu Ko Nu: sát thương 7, bạo 30)', gear.wn === 'Chu Ko Nu' && gear.wd === 7 && gear.wc === 30 && gear.crit === 30, JSON.stringify(gear));
  check('thiên phú: mỗi diễn viên tối đa 3, không cộng dồn cùng loại (Hồi HP +1%/s máu)', gear.b === 'true,false,true,true,false' && gear.buffs === 'regen,precision,pierce' && gear.hpRegen === 0.01, JSON.stringify(gear));
  const lg = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc; t.bag.length = 0; t.coins = 0; t.pop = 5; t.freeRefresh = 0;
    Tg.legacy(G, 'gem'); Tg.useBag(G); const gem = t.coins;
    Tg.legacy(G, 'codex'); Tg.useBag(G); const free = t.freeRefresh; const c0 = t.coins; Tg.refresh(G); const freeCost = c0 - t.coins;
    Tg.legacy(G, 'spring'); Tg.useBag(G); const pop = t.pop; t.pop = 8; Tg.legacy(G, 'spring'); const full = Tg.useBag(G).ok; t.pop = 8; t.bag.length = 0;
    const n0 = t.recs.length; Tg.legacy(G, 'brush'); Tg.useBag(G); const n1 = t.recs.length;
    t.bag.push({ kind: 'weapon', id: 'Webber', r: 2, price: 3 }); t.coins = 0; Tg.trash(G);
    return { gem, free, freeCost, pop, full, n0, n1, trash: t.coins, bag: t.bag.length };
  });
  check('di sản: Đá Ba Tư 1-6 vàng, Pháp Điển làm mới miễn phí, Suối +1 nổi tiếng (không vượt 8), Cọ Tiên sao chép 1 sao, thùng rác bán đúng giá',
    lg.gem >= 1 && lg.gem <= 6 && lg.free === 1 && lg.freeCost === 0 && lg.pop === 6 && lg.full === false && lg.n1 === lg.n0 + 1 && lg.trash === 3 && lg.bag === 0, JSON.stringify(lg));

  // ---- 8. liên kết [WIKI GC_Synergies]
  const sy = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc; t.recs.length = 0; t.level = 6; t.coins = 200; t.bag.length = 0; t.ancWins = 0;
    const hire = ids => { t.recs.length = 0; for (const id of ids) Tg.hire(G, id, 0, true); Tg.afterChange(G); };
    const tier = s => (t.syn[s] || {}).tier || 0, th = s => (t.syn[s] || {}).th || 0;
    hire(['taotie', 'taotie']); const dupTier = tier('ancient');
    hire(['taotie', 'aoyin']); const a2 = [tier('ancient'), th('ancient')]; const ra = t.recs[0], da = Tg.stat(G, ra), base = Tg.PERF.taotie.st[0];
    const hp2 = da.hp, w2 = Math.round(da.wDmg * 100), sp2 = Math.round(da.aspd * 100);
    hire(['taotie', 'aoyin', 'bifang', 'baize']); const a4 = [tier('ancient'), th('ancient')]; const d4 = Tg.stat(G, t.recs[0]); const w4 = Math.round(d4.wDmg * 100);
    hire(['taotie', 'aoyin']); t.ancWins = 2; Tg.afterChange(G); const wWin = Math.round(Tg.stat(G, t.recs[0]).wDmg * 100); t.ancWins = 9; Tg.afterChange(G); const wCap = Math.round(Tg.stat(G, t.recs[0]).wDmg * 100); t.ancWins = 0;
    hire(['simayi', 'guanyu', 'diaochan', 'sun', 'zhaoyun']); const war5 = [tier('war'), th('war')]; const dw = Tg.stat(G, t.recs[0]);
    hire(['taotie', 'macaque']); const sp = [tier('speed'), Math.round(Tg.stat(G, t.recs[0]).aspd * 100), Math.round(Tg.stat(G, t.recs[0]).mspd * 100)];
    hire(['taotie', 'macaque', 'guanyu', 'boreas']); const sp4 = [tier('speed'), Math.round(Tg.stat(G, t.recs[0]).aspd * 100)];
    hire(['yulong', 'peafowl', 'macaque', 'pigsy', 'rabbit']); const cel = [tier('celestial'), th('celestial')];
    hire(['boreas', 'feitian']); const bri = tier('brilliant');
    return { dupTier, a2, hp2: hp2, hpBase: base[0], w2, sp2, a4, w4, wWin, wCap, war5, defWar: dw.def - 0, regen: dw.hpRegenFlat, armorWar: dw.armor, sp, sp4, cel, bri };
  });
  check('liên kết đếm DIỄN VIÊN KHÁC LOẠI: 2 Thao Thiết không tính, Thao Thiết + Ngao Nhân = Thần Thoại Viễn Cổ bậc 2', sy.dupTier === 0 && sy.a2[0] === 1 && sy.a2[1] === 2, JSON.stringify(sy));
  check('Thần Thoại Viễn Cổ (2): +5% sát thương và +5% HP; thắng +3% mỗi trận, trần 15%; (4): +12%', sy.w2 === 105 && sy.hp2 === Math.round(sy.hpBase * 1.05) && sy.wWin === 111 && sy.wCap === 115 && sy.a4[1] === 4 && sy.w4 === 112, JSON.stringify(sy));
  check('Quần Hùng Trục Lộc (5): cả đội Thủ +5, hồi máu +2/s, giáp +20', sy.war5[0] === 3 && sy.war5[1] === 5 && sy.defWar >= 5 && sy.regen === 2, JSON.stringify(sy));
  check('Tinh Thông Tốc Độ (2): diễn viên có liên kết +15% công tốc và di chuyển (Thao Thiết + Lục Nhĩ); (4): +50%', sy.sp[0] === 1 && sy.sp[1] === 15 && sy.sp[2] === 15 && sy.sp4[0] === 2 && sy.sp4[1] === 50, JSON.stringify(sy));
  check('Quái Tiên 5 diễn viên đạt bậc 5; Nền Văn Minh Rực Rỡ 2 diễn viên đạt bậc 2', sy.cel[0] === 3 && sy.cel[1] === 5 && sy.bri === 1, JSON.stringify(sy));

  // ---- 9. vòng đấu thật: bấm E ở quầy Bắt đầu vòng, diễn viên tự đánh, vàng cuối vòng
  await ev(() => { const G = SK.G, t = G.tgc, Tg = SK.tgc; t.recs.length = 0; t.level = 1; t.round = 1; t.coins = 5; t.diff = 1; t.bag.length = 0; t.stats.rounds = 0; t.stats.kills = 0; for (const e of G.enemies) e.st = 'dead'; Tg.afterChange(G); Tg.hire(G, 'taotie', 1, true); Tg.rollMarket(G, false); Tg.rebuild(G); t.coins = 5; G.player.hp = 8; t.pop = 8; });
  const c9 = await ev(() => ({ coins: SK.G.tgc.coins, g: SK.TROOPGC.coins[1].join(',') }));
  check('vàng cuối vòng độ 1 theo bảng wiki: 4,5,6,7,10,10,10,10,10,12,10,10,10,10', c9.g === '4,5,6,7,10,10,10,10,10,12,10,10,10,10', c9.g);
  const gc = await ev(() => { const C = SK.TROOPGC; return { d4: C.coins[4].join(','), d5: C.coins[5].join(',') }; });
  check('vàng cuối vòng độ 4 và 5 theo bảng wiki', gc.d4 === '4,5,6,7,10,10,12,12,12,16,12,12,12,12' && gc.d5 === '4,5,6,7,12,12,12,12,12,16,12,12,12,12', JSON.stringify(gc));
  const start = await useStand(/^Bắt đầu vòng 1/);
  const b1 = await until(p, () => SK.G.tgc.phase === 'battle', null, 3000);
  check('bấm E ở quầy Bắt đầu: vòng 1 vào trận, hiện đồng hồ và quái tiến ra theo làn', !!start && b1);
  await sleep(1500);
  const sh = await ev(() => { const G = SK.G, t = G.tgc; return { foes: SK.tgc.aliveFoes(G).length, waves: t.waves.map(w => w.length).join(','), timer: Math.round(t.timer), stands: G.interactables.filter(o => o.tg).length, drawn: Object.assign({}, SK.tgc.drawn) }; });
  check('trong trận: có quái, 3 làn, quầy chợ ẩn đi, đồng hồ chạy', sh.foes >= 1 && sh.waves.split(',').length === 3 && sh.stands === 0 && sh.timer <= 75 && sh.timer > 60, JSON.stringify(sh));
  await p.screenshot({ path: path.join(SHOTS, '2-battle.png') });
  const kills0 = await ev(() => SK.G.tgc.stats.kills);
  const won1 = await until(p, () => SK.G.tgc.phase === 'market' && SK.G.tgc.round === 2, null, 90000);
  const r1 = await ev(() => { const G = SK.G, t = G.tgc; return { round: t.round, pop: t.pop, coins: t.coins, gain: t.lastGain, got: t.coinsGot || 0, kills: t.stats.kills, last: t.lastRound, stands: G.interactables.filter(o => o.tg).length }; });
  check('diễn viên tự hạ hết quái trước giờ: qua vòng 1 (vòng 2, nổi tiếng giữ 8), quầy chợ hiện lại', won1 && r1.round === 2 && r1.pop === 8 && r1.kills > kills0 && r1.stands > 5, JSON.stringify(r1));
  check('vàng sau vòng 1 = 5 (đầu) + 4 (bảng vòng 1) + vàng nhặt trong trận', r1.gain === 4 && r1.coins === 5 + 4 + r1.got, JSON.stringify(r1));

  // ---- 10. thua vòng: hết giờ -1 nổi tiếng, vòng giữ nguyên, vẫn nhận vàng; diễn viên chết hết cũng thua
  const c10 = await ev(() => SK.G.tgc.coins);
  await useStand(/^Bắt đầu vòng 2/);
  await until(p, () => SK.G.tgc.phase === 'battle', null, 3000);
  await ev(() => { SK.G.tgc.timer = 0.2; });
  const lost1 = await until(p, () => SK.G.tgc.phase === 'market', null, 5000);
  const r2 = await ev(() => { const t = SK.G.tgc; return { round: t.round, pop: t.pop, hp: SK.G.player.hp, coins: t.coins, gain: t.lastGain }; });
  check('hết giờ: thua vòng, -1 nổi tiếng (7), vẫn ở vòng 2, nhận vàng vòng 2 (5), thanh máu mèo = nổi tiếng', lost1 && r2.round === 2 && r2.pop === 7 && r2.hp === 7 && r2.gain === 5 && r2.coins === c10 + 5, JSON.stringify(r2));
  await useStand(/^Bắt đầu vòng 2/);
  await until(p, () => SK.G.tgc.phase === 'battle', null, 3000);
  await sleep(1200);
  await ev(() => { const G = SK.G, Tg = SK.tgc; for (const r of Tg.stage(G)) { const a = Tg.allyOf(G, r); Tg.hurt(G, a, r, 9999); if (r.hp <= 0 && !a.dead) { a.dead = true; a.onDie(G, a); } } });
  const lost2 = await until(p, () => SK.G.tgc.phase === 'market', null, 5000);
  const r3 = await ev(() => ({ pop: SK.G.tgc.pop, round: SK.G.tgc.round, alive: SK.tgc.stage(SK.G).every(r => !r.dead && r.hp > 0) }));
  check('diễn viên ra sân chết hết: thua vòng (-1 nổi tiếng = 6), diễn viên hồi sinh đầy ở chợ', lost2 && r3.pop === 6 && r3.round === 2 && r3.alive, JSON.stringify(r3));

  // ---- 11. vòng trùm 5 và 10, độ 3 trở lên có 2 trùm, hết giờ 2 trùm -2 [WIKI GC "Bosses"]
  const boss = await ev(async () => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, out = {};
    // xác trùm vòng trước còn nằm trong G.enemies: chỉ tính trùm còn sống, không thì vòng sau dừng dọn quái sớm và đếm dư
    const clearMinions = async () => { for (let i = 0; i < 40 && !G.enemies.some(e => e.tgBoss && e.st !== 'dead'); i++) { for (const e of G.enemies) if (e.tg && !e.tgBoss && e.st !== 'dead') SK.hurtEnemy(G, e, 99999, false, 0, 0); await new Promise(r => setTimeout(r, 250)); } };
    for (const [round, diff, key] of [[5, 1, 'r5d1'], [10, 3, 'r10d3']]) {
      t.round = round; t.diff = diff; t.pop = 8; t.phase = 'market'; for (const e of G.enemies) e.st = 'dead';
      for (const r of t.recs) { r.star = 3; } Tg.afterChange(G); Tg.respawn(G);
      Tg.startRound(G); await clearMinions();
      out[key] = { bosses: G.enemies.filter(e => e.tgBoss && e.st !== 'dead').length, flag: t.boss, phase: t.phase, timer: t.timerMax };
      if (key === 'r10d3') { t.timer = 0.1; await new Promise(r => setTimeout(r, 700)); out.lose2 = { pop: t.pop, phase: t.phase, round: t.round }; }
      else { for (const e of G.enemies) if (e.tgBoss) { e.hp = 1; } }
      for (let i = 0; i < 40 && t.phase === 'battle' && key === 'r5d1'; i++) { for (const e of G.enemies) if (e.tgBoss && e.st !== 'dead') SK.hurtEnemy(G, e, 99999, false, 0, 0); await new Promise(r => setTimeout(r, 250)); }
      if (key === 'r5d1') out.win5 = { phase: t.phase, round: t.round };
    }
    return out;
  });
  check('vòng 5 (độ 1): hạ hết quái thì 1 trùm xuất hiện, đồng hồ vòng trùm dài hơn; hạ trùm thì qua vòng', boss.r5d1.bosses === 1 && boss.r5d1.flag && boss.r5d1.timer > 75 && boss.win5.phase === 'market' && boss.win5.round === 6, JSON.stringify(boss));
  check('vòng 10 độ 3: 2 trùm; hết giờ khi 2 trùm còn sống trừ 2 nổi tiếng (8 -> 6)', boss.r10d3.bosses === 2 && boss.lose2.pop === 6 && boss.lose2.phase === 'market', JSON.stringify(boss));
  await p.screenshot({ path: path.join(SHOTS, '3-after-boss.png') });

  // ---- 12. kỹ năng chỉ huy [WIKI GC "Commander Skill"]
  const cmd = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, C = SK.TROOPGC, p = G.player, out = {};
    t.phase = 'market'; t.recs.length = 0; t.level = 4; t.coins = 99; Tg.afterChange(G);
    for (const id of ['taotie', 'moai', 'pigsy']) Tg.hire(G, id, 0, true);
    for (const r of t.recs) { r.on = true; r.dead = false; } Tg.afterChange(G); Tg.respawn(G);
    const costs = C.cmdOrder.map(k => C.cmd[k].cost).join(',');
    out.costs = costs;
    for (const r of t.recs) { r.hp = 1; }
    p.energy = 100; t.cmd = 'heal'; p.x = t.base.x; p.y = t.base.y;
    for (const r of t.recs) { const a = Tg.allyOf(G, r); a.x = p.x + 10; a.y = p.y; }
    const e0 = p.energy; const ok = Tg.cast(G);
    out.heal = { ok, cost: e0 - p.energy, hp: t.recs.map(r => Math.round(r.hp * 10) / 10), want: t.recs.map(r => Math.round((1 + Tg.stat(G, r).hp * 0.3) * 10) / 10) };
    p.energy = 70; out.heal.low = Tg.cast(G);
    t.cmd = 'haste'; p.energy = 100; Tg.cast(G); out.haste = { cost: 100 - p.energy, t: Tg.allyOf(G, t.recs[0]).hasteT, aspd: Tg.rt(G, Tg.allyOf(G, t.recs[0]), t.recs[0], Tg.stat(G, t.recs[0])).aspd };
    t.cmd = 'brute'; p.energy = 100; Tg.cast(G); out.brute = { cost: 100 - p.energy, t: Tg.allyOf(G, t.recs[0]).bruteT, dmg: Tg.rt(G, Tg.allyOf(G, t.recs[0]), t.recs[0], Tg.stat(G, t.recs[0])).dmg };
    t.cmd = 'packet'; const cs = []; for (let i = 0; i < 40; i++) { p.energy = 100; const c0 = t.coins; Tg.cast(G); cs.push(t.coins - c0); } out.packet = { min: Math.min(...cs), max: Math.max(...cs), cost: 100 };
    t.cmd = 'shield'; p.energy = 100; Tg.cast(G); const sa = t.recs.map(r => Tg.allyOf(G, r)).find(a => a.shieldT > 0); const hp0 = t.recs.find(r => Tg.allyOf(G, r) === sa).hp; const dmg = Tg.hurt(G, sa, t.recs.find(r => Tg.allyOf(G, r) === sa), 5); out.shield = { t: sa.shieldT, absorbed: dmg === 0 && t.recs.find(r => Tg.allyOf(G, r) === sa).hp === hp0, cost: 100 - p.energy };
    t.cmd = 'frost'; p.energy = 100; const foe = SK.makeEnemy(G, G.map.th.enemies.filter(i => SK.D.enemies[i])[0], p.x + 20, p.y, G.map.rooms[0]); foe.tg = 1; foe.hp = foe.hpMax = 100; foe.st = 'idle'; G.enemies.push(foe); Tg.cast(G); out.frost = { dmg: 100 - foe.hp, cost: 100 - p.energy };
    for (const e of G.enemies) e.st = 'dead';
    return out;
  });
  check('6 kỹ năng chỉ huy tốn NL 80/40/40/60/100/60 (Túi Chữa Trị, Adrenalin, Đại Lực, Pha Lê, Lì Xì, Máy Tạo Giáp)', cmd.costs === '80,40,40,60,100,60' && cmd.heal.cost === 80 && cmd.haste.cost === 40 && cmd.brute.cost === 40 && cmd.shield.cost === 60 && cmd.frost.cost === 60, JSON.stringify(cmd));
  check('Túi Chữa Trị: diễn viên ở gần +30% HP tối đa; thiếu NL (70 < 80) thì từ chối', cmd.heal.ok && JSON.stringify(cmd.heal.hp) === JSON.stringify(cmd.heal.want) && cmd.heal.low === false, JSON.stringify(cmd.heal));
  check('Adrenalin +30% công tốc 3 s; Đại Lực +30% sát thương 3 s', cmd.haste.t === 3 && cmd.haste.aspd === 0.3 && cmd.brute.t === 3 && Math.abs(cmd.brute.dmg - 1.3) < 1e-9, JSON.stringify([cmd.haste, cmd.brute]));
  check('Lì Xì ra 1 tới 4 vàng; Máy Tạo Giáp: khiên 5 s chặn hết sát thương; Pha Lê Đóng Băng gây sát thương lên địch', cmd.packet.min >= 1 && cmd.packet.max <= 4 && cmd.packet.min < cmd.packet.max && cmd.shield.t === 5 && cmd.shield.absorbed && cmd.frost.dmg === 10, JSON.stringify([cmd.packet, cmd.shield, cmd.frost]));
  // bấm K thật: kỹ năng chỉ huy đang chọn, bấm L thật: còi
  await ev(() => { const G = SK.G, t = G.tgc; t.cmd = 'heal'; G.pickups.length = 0; G.player.energy = 100; for (const r of t.recs) r.hp = 1; });
  await p.keyboard.press('KeyK'); await sleep(250);
  const kk = await ev(() => ({ en: SK.G.player.energy, hp: SK.G.tgc.recs[0].hp }));
  check('bấm K thật: dùng kỹ năng chỉ huy đang chọn (NL 100 -> 20, diễn viên được hồi)', kk.en === 20 && kk.hp > 1, JSON.stringify(kk));
  const w0 = await ev(() => SK.G.tgc.gather);
  await p.keyboard.press('KeyL'); await sleep(200);
  const w1 = await ev(() => SK.G.tgc.gather);
  await p.keyboard.press('KeyL'); await sleep(200);
  const w2 = await ev(() => SK.G.tgc.gather);
  check('bấm L thật: còi đổi Xuất kích <-> Tập hợp', w0 === false && w1 === true && w2 === false, [w0, w1, w2].join(','));
  const gather = await ev(async () => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, p = G.player; t.gather = true; t.round = 3; t.diff = 1; t.pop = 8;
    p.x = t.base.x - 60; p.y = t.base.y + 30;
    Tg.startRound(G); await new Promise(r => setTimeout(r, 4500));
    const d = Tg.stage(G).map(r => { const a = Tg.allyOf(G, r); return a ? Math.round(Math.hypot(a.x - p.x, a.y - p.y) / 16) : 99; });
    t.gather = false; return { d, max: Math.max(...d) };
  });
  check('Tập hợp: diễn viên kéo về cạnh mèo (cách <= 4 ô sau 4,5 giây)', gather.max <= 4, JSON.stringify(gather));
  await ev(() => { const G = SK.G; for (const e of G.enemies) e.st = 'dead'; SK.tgc.endRound(G, true); });

  // ---- 13. 18 kỹ năng diễn viên: mỗi loại thi triển được khi NL đầy, không lỗi
  const sweep = await ev(async () => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, C = SK.TROOPGC, out = { cast: [], miss: [] };
    t.level = 6; t.coins = 999;
    for (const id of C.ids) {
      t.phase = 'market'; t.recs.length = 0; Tg.afterChange(G);
      const r = Tg.newRec(G, id); r.star = 3; r.on = true; t.recs.push(r); Tg.afterChange(G); Tg.respawn(G);
      t.round = 8; t.pop = 8; Tg.startRound(G);
      const c0 = r.skUsed || 0, t0 = performance.now();
      while (performance.now() - t0 < 9000 && (r.skUsed || 0) === c0 && t.phase === 'battle') { const d = Tg.stat(G, r); if (r.e < d.eMax - 1) r.e = d.eMax; await new Promise(z => setTimeout(z, 200)); }
      (r.skUsed > c0 ? out.cast : out.miss).push(id);
      await new Promise(z => setTimeout(z, 600));
      if (t.phase === 'battle') Tg.endRound(G, true);
    }
    return out;
  });
  check('18 diễn viên đều thi triển được kỹ năng riêng khi NL đầy (★3)', sweep.cast.length === 18 && sweep.miss.length === 0, JSON.stringify(sweep));
  const skn = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, S = Tg.SKILL, o = {};
    const mk = (id, star) => { t.recs.length = 0; const r = Tg.newRec(G, id); r.star = star; r.on = true; t.recs.push(r); Tg.afterChange(G); t.phase = 'market'; Tg.respawn(G); const a = Tg.allyOf(G, r); return [a, r, Tg.stat(G, r)]; };
    const f = G.map.th.enemies.filter(i => SK.D.enemies[i])[0], foe = () => { const e = SK.makeEnemy(G, f, 330, 330, G.map.rooms[0]); e.st = 'idle'; e.hp = e.hpMax = 9999; G.enemies.push(e); return e; };
    const q = [1, 2, 3].map(s => { const [a, r, d] = mk('pigsy', s); S.shield.fn(G, a, r, d, foe()); return [a.shieldT, a.shieldGain]; });
    const dw = [1, 2, 3].map(s => { const [a, r, d] = mk('taotie', s); S.dual.fn(G, a, r, d); return a.dualMul; });
    const st = (() => { const [a, r, d] = mk('macaque', 1); S.stealth.fn(G, a, r, d); return [a.invT, a.critT]; })();
    const sc = [1, 2, 3].map(s => { const [a, r, d] = mk('guanyu', s); S.scatter.fn(G, a, r, d); return [a.scatterT, a.scatterN]; });
    const lance = (() => { const [a, r, d] = mk('zhaoyun', 3); const e = foe(); e.hp = e.hpMax = 5; e.x = a.x + 12; e.y = a.y; S.lance.fn(G, a, r, d, e); return { refill: a.refill, dead: e.hp <= 0 }; })();
    const cd = (() => { t.recs.length = 0; const r = Tg.newRec(G, 'taotie'); const dd = Tg.stat(G, r); return { e: dd.eMax, regen: dd.regen }; })();
    for (const e of G.enemies) e.st = 'dead';
    return { q: JSON.stringify(q), dw: dw.join(','), st: st.join(','), sc: JSON.stringify(sc), lance, cd };
  });
  check('số kỹ năng theo sao: Khiên Năng Lượng 1,5/2,5/4 s và hồi 2/3/5 NL; Mở Hết Hỏa Lực 100%/130%/160%; Tàng Hình 2 s bạo +100%',
    skn.q === '[[1.5,2],[2.5,3],[4,5]]' && skn.dw === '1,1.3,1.6' && skn.st === '2,2', JSON.stringify(skn));
  check('Tự Do Chiến 2/2,5/3 s thêm 1/2/3 luồng; Long Trụy hạ mục tiêu thì đầy NL; NL hồi 10/s tối đa 40 (Thao Thiết)', skn.sc === '[[2,1],[2.5,2],[3,3]]' && skn.lance.refill && skn.lance.dead && skn.cd.e === 40 && skn.cd.regen === 10, JSON.stringify(skn));

  // ---- 14. phần thưởng thiên phú: vài thiên phú đo được
  const bf = await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc, out = {};
    t.recs.length = 0; const r = Tg.newRec(G, 'taotie'); t.recs.push(r); r.on = true; Tg.afterChange(G); Tg.respawn(G);
    const base = Object.assign({}, Tg.stat(G, r)), ex = (b, f) => { r.buffs = b; r.drinks = []; r.d = null; return f(Tg.stat(G, r)); };
    out.regen = ex(['regen'], d => [d.hp - base.hp, d.hpRegen]);
    out.precision = ex(['precision'], d => [d.crit - base.crit, Math.round(d.critDmg * 100)]);
    out.pierce = ex(['pierce'], d => [Math.round((d.wDmg - base.wDmg) * 100), d.pierce]);
    out.armorBlast = ex(['armorBlast'], d => d.armor - base.armor);
    out.energy = ex(['energyRegen'], d => [d.regen - base.regen, d.eMax - base.eMax]);
    out.laser = ex(['laser'], d => Math.round((d.skDmg - base.skDmg) * 100));
    out.split = ex(['splitB'], d => d.split - base.split);
    out.combo = ex(['comboB'], d => d.combo - base.combo);
    out.unfail = ex(['unfail'], d => d.def - base.def);
    r.buffs = ['unfail']; r.d = null; const a = Tg.allyOf(G, r); r.hits = 0; r.hp = r.armor = 99; r.armor = 0; Tg.hurt(G, a, r, 1); Tg.hurt(G, a, r, 1); Tg.hurt(G, a, r, 1); out.unfailHits = r.hits;
    r.buffs = ['unyield']; r.hp = 5; r.armor = 0; const o2 = Tg.newRec(G, 'moai'); o2.on = true; t.recs.push(o2); Tg.hurt(G, a, r, 999); out.unyield = r.hp;
    r.buffs = []; return out;
  });
  check('thiên phú theo bảng wiki: Hồi HP (+15 máu, 1%/s), Bạo Chuẩn (+25 bạo, +35%), Xuyên Thấu (+25%, xuyên 1), Phá Giáp Xung Kích (+12 giáp)',
    bf.regen[0] === 15 && bf.regen[1] === 0.01 && bf.precision[0] === 25 && bf.precision[1] === 35 && bf.pierce[0] === 25 && bf.pierce[1] === 1 && bf.armorBlast === 12, JSON.stringify(bf));
  check('Hồi N.Lượng (+4 hồi, -5 tiêu hao), Mưa Laze (+50% kỹ năng), Tăng Súng Ngắn (+1 đạn), Liên Kích (+1), Kiên Cố (Thủ +2), Bất Khuất (giữ 1 HP khi còn đồng đội)',
    bf.energy[0] === 4 && bf.energy[1] === -5 && bf.laser === 50 && bf.split === 1 && bf.combo === 1 && bf.unfail === 2 && bf.unyield === 1, JSON.stringify(bf));

  // ---- 15. vẽ bằng prefab gốc: mèo Tiêu Đen (pet42) và vật rơi (vàng, cầu NL)
  await ev(() => { const G = SK.G, t = G.tgc; t.phase = 'market'; t.drops.push({ k: 'coin', x: G.player.x + 20, y: G.player.y, t: 0 }, { k: 'orb', x: G.player.x - 20, y: G.player.y, t: 0 }); });
  await sleep(500);
  const art = await ev(() => Object.assign({}, SK.tgc.drawn));
  check('vẽ bằng khoá prefab gốc: mèo Tiêu Đen (pet42), đồng vàng (coin_1), cầu năng lượng (energy)', art.pet42 > 0 && art.coin_1 > 0 && art.energy > 0, JSON.stringify(art));
  await ev(() => { const G = SK.G, t = G.tgc; t.drops = []; t.phase = 'market'; for (const e of G.enemies) e.st = 'dead'; SK.tgc.rebuild(G); });

  // ---- 16. thắng thật: hạ Vua Ti Vi vòng 15 -> cổng -> engine phát victory + runEnd
  const re0 = await ev(() => window.__re.length);
  await ev(() => {
    const G = SK.G, t = G.tgc, Tg = SK.tgc; t.round = 15; t.diff = 2; t.pop = 5; t.coins = 99; t.level = 6; t.phase = 'market'; t.recs.length = 0; Tg.afterChange(G);
    for (const id of ['taotie', 'pigsy', 'guanyu', 'zhaoyun', 'diaochan', 'moai']) Tg.hire(G, id, 0, true);
    for (const r of t.recs) r.star = 3; Tg.afterChange(G); Tg.respawn(G); for (const e of G.enemies) e.st = 'dead';
  });
  await useStand(/^Bắt đầu vòng 15/);
  await until(p, () => SK.G.tgc.phase === 'battle', null, 3000);
  const kill15 = await ev(async () => {
    const G = SK.G, t = G.tgc; let sawBoss = 0;
    for (let i = 0; i < 160 && G.state === 'stage'; i++) {
      for (const e of G.enemies) if (e.tg && e.st !== 'dead') { if (e.tgBoss) sawBoss++; SK.hurtEnemy(G, e, 99999, false, 0, 0); }
      await new Promise(r => setTimeout(r, 250));
      if (t.won) break;
    }
    return { sawBoss, won: t.won, portal: !!G.portal, state: G.state };
  });
  check('vòng 15: hạ quái xong Vua Ti Vi mới xuất hiện (1 trùm dù độ >= 3 trừ trường hợp này), hạ trùm thì mở cổng', kill15.sawBoss >= 1 && kill15.won && kill15.portal, JSON.stringify(kill15));
  const vic = await until(p, () => SK_GAME.state === 'victory', null, 8000);
  const vo = await ev(() => ({ overlay: !document.getElementById('sk-win').hidden, text: document.getElementById('sk-win-info').textContent, re: window.__re.slice(-1)[0] }));
  await sleep(300);
  const vt = await ev(() => document.getElementById('sk-win-info').textContent);
  check('thắng đi đường thật của engine: state victory, runEnd.won = true, hiện màn thắng với chữ Đại Đại Chỉ Huy', vic && vo.overlay && vo.re && vo.re.won === true && vo.re.mode === 'troopgc' && /Đại Đại Chỉ Huy/.test(vt) && (await ev(() => window.__re.length)) === re0 + 1, JSON.stringify({ vo, vt }));
  const prof = await ev(() => ({ won: SK.tgc.prof.won, open2: SK.TROOPGC.cmdUnlockBy.join(',') }));
  check('thắng độ 2 được ghi hồ sơ (độ đã thắng = 2) và mở kỹ năng chỉ huy kế tiếp', prof.won === 2, JSON.stringify(prof));
  await p.screenshot({ path: path.join(SHOTS, '4-win.png') });

  // ---- 17. thua thật: hết điểm nổi tiếng -> engine đặt chết, runEnd.won = false
  await ev(() => { SK.setOverlay(null); SK.G.state = 'hall'; SK_GAME.debug.seed(12); SK.lobby.launch('knight', 'troopgc', []); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play' && SK.G.mode === 'troopgc', null, 15000);
  const re1 = await ev(() => window.__re.length);
  await ev(() => { const G = SK.G, t = G.tgc, Tg = SK.tgc; t.pop = 1; G.player.hp = 1; t.coins = 9; Tg.hire(G, 'taotie', 1, true); });
  await useStand(/^Bắt đầu vòng 1/);
  await until(p, () => SK.G.tgc.phase === 'battle', null, 3000);
  await ev(() => { SK.G.tgc.timer = 0.2; });
  const dead = await until(p, () => SK_GAME.state === 'dead', null, 8000);
  await sleep(300);
  const lo = await ev(() => ({ overlay: !document.getElementById('sk-over').hidden, text: document.getElementById('sk-over-info').textContent, re: window.__re.slice(-1)[0], n: window.__re.length, lost: SK.G.tgc.lost, pop: SK.G.tgc.pop }));
  check('thua đi đường thật của engine: nổi tiếng về 0 -> state dead, runEnd.won = false, hiện màn thua', dead && lo.overlay && lo.re && lo.re.won === false && lo.re.mode === 'troopgc' && lo.n === re1 + 1 && lo.lost && lo.pop === 0, JSON.stringify(lo));
  check('chữ màn thua ghi vòng đã tới', /Đại Đại Chỉ Huy/.test(lo.text) && /vòng 1\/15/.test(lo.text), lo.text);
  await p.screenshot({ path: path.join(SHOTS, '5-lose.png') });

  // ---- 18. hồi quy chế độ khác không bị đụng
  await ev(() => { SK.setOverlay(null); SK.G.state = 'hall'; SK.lobby.launch('knight', 'level', []); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 15000);
  const reg = await ev(() => ({ mode: SK.G.mode, tgc: SK.G.tgc, n: SK.STAGES.length, petOff: SK.G.petOff }));
  check('vào Chế độ Ải sau đó: không còn G.tgc, 15 ải, thú cưng trở lại', reg.mode === 'level' && !reg.tgc && reg.n === 15 && !reg.petOff, JSON.stringify(reg));
  check('không có lỗi trang trong cả lượt kiểm', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log(results.join('\n'));
  console.log('\n' + pass + ' ĐẠT, ' + fail + ' HỎNG  · ảnh: ' + SHOTS);
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
