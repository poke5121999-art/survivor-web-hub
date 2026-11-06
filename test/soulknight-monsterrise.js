/*
 * Quái Thú Trỗi Dậy (games/soulknight): chế độ tự đánh trên làn (js/monsterrise.js, monsterrise2.js; MODES.md mục 2i).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-monsterrise.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-monsterrise/.
 *
 * 1. Thẻ ở sảnh: bấm thẻ + nút Bắt đầu thật → vào chế độ (chọn 1 trong 3 quái xuất phát, bản đồ 3 tầng).
 * 2. Luật lõi đo trên mô phỏng thật: bảng chỉ số wiki, sát thương, Khiên, Chết Đói, Sương mù, kỹ năng, gộp quái, quy mô đội, cửa hàng, nghỉ, nghi lễ.
 * 3. Thắng: đi cả ván bằng click thật (bản đồ -> xếp quái -> đánh -> thưởng) tới hạ đội quán quân; runEnd.won = true do mã chế độ phát.
 * 4. Thua: đội yếu thua một trận thật; runEnd.won = false. Không có chỗ nào tự SK.emit('runEnd').
 * 5. Hình vẽ bằng prefab gốc M_* của monster_rise.ab; ảnh để tự xem.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-monsterrise');
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
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(60); }
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
  process.on('unhandledRejection', e => { console.log(results.join('\n')); console.log('LỖI: ' + String(e).slice(0, 500)); process.exit(2); });

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });
  // theo dõi runEnd: chỉ ghi, không phát
  await ev(() => { window.__ends = []; SK.on('runEnd', (G, r) => window.__ends.push({ won: r.won, stage: r.stage, kills: r.kills })); });

  // ---- 1. thẻ chế độ + vào ván bằng click thật
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="monsterrise"]');
  const card = await ev(() => ({ title: document.getElementById('hs-mode-title').textContent, go: !document.getElementById('hs-mode-go').disabled, desc: document.getElementById('hs-mode-desc').textContent }));
  check('bảng chế độ có thẻ Quái Thú Trỗi Dậy, nút Bắt đầu bật', card.title === 'Quái Thú Trỗi Dậy' && card.go, JSON.stringify(card));
  check('chữ thẻ không chứa nhãn nguồn', !/\[(LOC|WIKI|ĐO|ƯỚC)/.test(card.desc));
  await ev(() => { SK.monsterrise.seed(11); });
  await p.click('#hs-mode-go');
  await until(p, () => SK.G.state === 'monsterrise' && document.querySelector('#mr [data-start]'), null, 8000);
  const s0 = await ev(() => { const R = SK.monsterrise.R; return { state: SK.G.state, mode: SK.G.mode, screen: R.screen, starters: R.starters.length, shown: !document.getElementById('mr').hidden, cards: document.querySelectorAll('#mr [data-start]').length, coins: R.coins, food: R.food, cap: R.cap, lobbyHidden: document.getElementById('sk-lobby').hidden }; });
  check('vào chế độ từ thẻ: state monsterrise, giao diện hiện, 3 quái xuất phát để chọn', s0.state === 'monsterrise' && s0.mode === 'monsterrise' && s0.screen === 'start' && s0.starters === 3 && s0.cards === 3 && s0.shown && s0.lobbyHidden, JSON.stringify(s0));
  await sleep(200);
  await p.screenshot({ path: path.join(SHOTS, '1-start.png') });
  await p.click('#mr [data-start] button:not([disabled])');
  const mid = await ev(() => ({ screen: SK.monsterrise.R.screen, mons: SK.monsterrise.R.mons.length, dis: document.querySelectorAll('#mr [data-start] button[disabled]').length }));
  check('chọn 2 quái xuất phát: sau con đầu vẫn ở màn chọn và nút con đã chọn bị khoá', mid.screen === 'start' && mid.mons === 1 && mid.dis === 1, JSON.stringify(mid));
  await p.click('#mr [data-start] button:not([disabled])');
  const s1 = await ev(() => { const R = SK.monsterrise.R; return { screen: R.screen, mons: R.mons.length, used: SK.monsterrise.used(R), cols: R.map.cols.length, nodes: R.map.cols.map(c => c.length), enabled: [...document.querySelectorAll('#mr [data-node]:not([disabled])')].length, squad: document.querySelectorAll('#mr-squad .mr-card').length }; });
  check('chọn đủ quái xuất phát (click): vào bản đồ, đội 2 quái, thanh đội hiện thẻ', s1.screen === 'map' && s1.mons === 2 && s1.squad === 2 && s1.used >= 1, JSON.stringify(s1));
  check('bản đồ tầng 1: cột xuất phát + 4 cột điểm dừng (2-3 điểm) + cột trùm; chỉ điểm kế của vị trí hiện tại bấm được', s1.cols === 6 && s1.nodes[0] === 1 && s1.nodes[5] === 1 && s1.nodes.slice(1, 5).every(n => n >= 2 && n <= 3) && s1.enabled >= 1 && s1.enabled <= 2, JSON.stringify(s1.nodes));
  await p.screenshot({ path: path.join(SHOTS, '2-map.png') });

  // ---- 2. luật lõi (mô phỏng thật, hạt giống cố định)
  const rules = await ev(() => {
    const M = SK.monsterrise, C = M.C, MON = M.MON, out = {};
    M.seed(3);
    out.n = M.ids.length;
    out.stats = MON.priest.hp === 2450 && MON.priest.atk === 190 && MON.priest.range === 7 && MON.priest.cost === 4 && MON.sniper.atk === 300 && MON.shield.hp === 3500 && MON.borer.aspd === 2.14 && MON.slime_g.hp === 600 && MON.goldmon.ms === 4 && MON.charger.crit === 10 && MON.charger.critDmg === 150;
    const R = M.newRun('knight');
    const mk = (side, key, x, y, o) => M.mkUnit(side, key, Object.assign({ x, y }, o || {}));
    const bt = (a, e, o) => { const B = { units: a.concat(e), dead: [], fx: [], time: 0, over: false, won: null, killed: 0, starving: !!(o && o.starving), speed: 1, rec: new Map() }; return B; };
    // sát thương thường: không bạo, không giáp = atk
    { const a = mk('a', 'charger', 1, 1), e = mk('e', 'shield', 2, 1); a.crit = 0; const B = bt([a], [e]); M.hit(B, a, e, 100, {}); out.dmg = e.max - e.hp; }
    // Khiên: mất 1 Khiên và nhận ít hơn 50%
    { const a = mk('a', 'charger', 1, 1), e = mk('e', 'shield', 2, 1, { shield: 3 }); a.crit = 0; const B = bt([a], [e]); M.hit(B, a, e, 100, {}); out.shield = [e.max - e.hp, e.shield]; }
    // Chết Đói: quái phe ta gây ít hơn 30%
    { const a = mk('a', 'charger', 1, 1), e = mk('e', 'shield', 2, 1); a.crit = 0; const B = bt([a], [e], { starving: true }); M.hit(B, a, e, 100, {}); out.starve = e.max - e.hp; }
    // Bạo 150%
    { const a = mk('a', 'charger', 1, 1), e = mk('e', 'shield', 2, 1); a.crit = 100; const B = bt([a], [e]); M.hit(B, a, e, 100, {}); out.crit = e.max - e.hp; }
    // Sương mù: sau 120 giây quái ta mất 2% HP tối đa mỗi giây
    { const a = mk('a', 'shield', 0.5, 4.5), e = mk('e', 'shield', 11, 0.5); e.m = Object.assign({}, e.m); a.range = 0.1; e.range = 0.1; a.ms = 0; e.ms = 0; a.cdMax = 0; e.cdMax = 0; a.atkT = e.atkT = 1e9;
      const B = bt([a], [e]); B.time = 119.9; const h0 = a.hp; for (let i = 0; i < 40; i++) M.battleStep(B, 0.05); out.mist = [B.mist, Math.round((h0 - a.hp) / a.max * 1000) / 1000]; }
    return out;
  });
  check('bảng chỉ số quái thú khớp wiki (Đại Tư Tế 2450/190/tầm 7/cost 4, Bắn Tỉa 300, Khiên Đế Quốc 3500, Slime Lục 600, Xu Hoạt Hóa chạy 4, bạo 10%/150%)', rules.stats && rules.n === 30, JSON.stringify(rules.stats) + ' n=' + rules.n);
  check('sát thương: đánh thường 100 trừ đúng 100; bạo x1,5 = 150', rules.dmg === 100 && rules.crit === 150, 'dmg=' + rules.dmg + ' crit=' + rules.crit);
  check('Khiên: nhận ít hơn 50% (50) và mất 1 Khiên (3 -> 2)', rules.shield[0] === 50 && rules.shield[1] === 2, JSON.stringify(rules.shield));
  check('Chết Đói: quái phe ta gây 70 thay vì 100', rules.starve === 70, String(rules.starve));
  check('Sương mù: tới 120 giây bật cờ và mất 2% HP tối đa mỗi giây (0,05 giây x40 = 2 giây ~ 4%)', rules.mist[0] === true && rules.mist[1] >= 0.035 && rules.mist[1] <= 0.045, JSON.stringify(rules.mist));

  // kỹ năng từng cái, dựng trận nhỏ qua startBattle thật
  const sk = await ev(() => {
    const M = SK.monsterrise, MON = M.MON, out = {};
    M.seed(9);
    const R = M.newRun('knight');
    const fresh = (allies, foes) => { const al = allies.map(([key, x, y, o]) => ({ rec: Object.assign({ uid: Math.random(), key, lvl: 1, badges: [], hp: MON[key].hp }, o || {}), x, y })); const fo = foes.map(([key, x, y, o]) => { const u = M.mkUnit('e', key, Object.assign({ x, y }, o || {})); return u; }); const B = M.startBattle(R, al, fo); fo.forEach((u, i) => { u.x = foes[i][1]; u.y = foes[i][2]; u.home = [u.x, u.y]; }); B.units.filter(u => u.side === 'a').forEach(u => { u.crit = 0; }); fo.forEach(u => { u.crit = 0; }); return B; };
    const dmgTo = (B, k) => { const e = B.units.find(u => u.side === 'e' && u.key === k); return e.max - e.hp; };
    // Bùa Chú: pháo đầu trận 975 + 130 x 2 quái sau lưng cùng hàng
    { const B = fresh([['arcane', 3, 2], ['shield', 2, 2], ['shield', 1, 2]], [['cannibal', 9, 2]]); out.cannon = dmgTo(B, 'cannibal'); }
    // Bắn Tỉa: đòn kế 825 (kỹ năng gài đòn kế)
    { const B = fresh([['sniper', 1, 2]], [['cannibal', 5, 2, { hpMul: 3 }]]); const u = B.units[0]; u.cdT = 0.01; M.battleStep(B, 0.02); out.snipeSet = !!(u.nextAtk && u.nextAtk.dmg === 825); const e = B.units[1]; const h = e.hp; u.atkT = 0; M.battleStep(B, 0.02); out.snipe = Math.round(h - e.hp); }
    // Xẻng Đào: hồi 500 HP
    { const B = fresh([['spader', 1, 2, { hp: 1000 }]], [['cannibal', 11, 4]]); const u = B.units[0]; u.cdT = 0.01; const h = u.hp; M.battleStep(B, 0.02); out.heal500 = Math.round(u.hp - h); }
    // Kiếm Thủ Hộ: 228 lên địch trong tầm 1,5 và hồi 4,5% cho đồng đội kề
    { const B = fresh([['guardian', 1, 2], ['shield', 1.5, 2, { hp: 1000 }]], [['cannibal', 1.9, 2, { hpMul: 3 }]]); const g = B.units[0], al = B.units[1], e = B.units[2]; g.cdT = 0.01; g.atkT = 99; al.atkT = 99; e.atkT = 99; const h = al.hp; M.battleStep(B, 0.02); out.sword = [Math.round(e.max - e.hp), Math.round((al.hp - h) / al.max * 1000) / 10]; }
    // Khiên Đế Quốc: 5 Khiên cho mình, 3 cho quái kề
    { const B = fresh([['shield', 1, 2], ['novice', 1.5, 2]], [['cannibal', 11, 4]]); const u = B.units[0]; u.cdT = 0.01; M.battleStep(B, 0.02); out.formation = [u.shield, B.units[1].shield]; }
    // Đại Tư Tế: sét 3 địch, mỗi lần thứ 2 gây choáng
    { const B = fresh([['priest', 1, 2]], [['slime_y', 4, 0, { hpMul: 9 }], ['slime_y', 5, 2, { hpMul: 9 }], ['slime_y', 6, 4, { hpMul: 9 }], ['slime_y', 7, 1, { hpMul: 9 }]]); const u = B.units[0]; u.cdT = 0.01; B.units.forEach(x => { if (x !== u) x.atkT = 99; }); u.atkT = 99; M.battleStep(B, 0.02); out.lightning = B.units.filter(x => x.side === 'e' && x.hp < x.max).length; u.cdT = 0.01; M.battleStep(B, 0.02); out.stun = B.units.filter(x => x.st.stun > 0).length; }
    // Goblin Xung Phong: đầu trận 600 và đẩy lùi 4 ô
    { const R2 = M.newRun('knight'); const foe = M.mkUnit('e', 'cannibal', { x: 8, y: 2, hpMul: 3 }); const B = M.startBattle(R2, [{ rec: { uid: 77, key: 'charger', lvl: 1, badges: [], hp: 2000 }, x: 1, y: 2 }], [foe]); const e = foe; out.charge = [Math.round(e.max - e.hp), Math.round((e.x - e.home[0]) * 10) / 10, Math.round((Math.min(11.8, e.home[0] + 4) - e.home[0]) * 10) / 10]; }
    // Trùm Bóng Chày: mỗi 4 lần dùng kỹ năng triệu hồi Khỉ Bàn Tay Vàng
    { const B = fresh([['batter', 1, 2]], [['cannibal', 11, 4, { hpMul: 9 }]]); const u = B.units[0]; B.units[1].atkT = 99; u.atkT = 99; let n0 = B.units.length; for (let i = 0; i < 4; i++) { u.cdT = 0.01; M.battleStep(B, 0.02); } out.summon = B.units.length - n0; }
    // Gộp quái: cùng loại lên cấp, không tốn quy mô; quy mô đầy thì từ chối
    { const R2 = M.newRun('knight'); R2.mons.push({ uid: 1, key: 'charger', lvl: 1, hp: 2000, badges: [] }); const u0 = M.used(R2); const r = M.recruit(R2, 'charger'); out.merge = [r.ok, r.up, R2.mons[0].lvl, M.used(R2) === u0, M.maxHp(R2.mons[0])];
      R2.cap = 6; R2.mons.push({ uid: 2, key: 'priest', lvl: 1, hp: 2450, badges: [] }); const f = M.recruit(R2, 'savior'); out.full = [f.ok, f.why]; }
    // Quái chết mất hẳn
    { const R2 = M.newRun('knight'); const rec = { uid: 5, key: 'driller', lvl: 1, hp: 1800, badges: [] }; R2.mons.push(rec); const B = fresh([['driller', 1, 2, { hp: 1 }]], [['cannibal', 2, 2]]); const u = B.units[0]; const al = [{ rec, x: 0, y: 2 }]; const B2 = M.startBattle(R2, al, [M.mkUnit('e', 'cannibal', { x: 7, y: 2 })]); B2.units[0].hp = 1; M.simulate(B2, 60); M.settle(R2, B2); out.dead = [B2.won, R2.mons.length, R2.fallen.length]; }
    // Cửa hàng: thiếu vàng bị từ chối, đủ vàng trừ đúng giá
    { const R2 = M.newRun('knight'); R2.coins = 10; R2.shop = M.rollShop(R2); const it = R2.shop.find(x => x.kind === 'food'); const a = M.buy(R2, it); R2.coins = 100; const f0 = R2.food; const b = M.buy(R2, it); out.shop = [a.ok, a.why, b.ok, R2.coins, R2.food - f0]; }
    // Nghỉ ngơi: 30% / bữa ăn 60% tốn 2 thức ăn
    { const R2 = M.newRun('knight'); R2.mons.push({ uid: 7, key: 'shield', lvl: 1, hp: 100, badges: [] }); M.rest(R2, false); const a = R2.mons[0].hp; R2.mons[0].hp = 100; const f0 = R2.food; M.rest(R2, true); out.rest = [a, R2.mons[0].hp, f0 - R2.food]; }
    // Nghi lễ: một quái hi sinh, quái kia nhận 1 huy hiệu
    { const R2 = M.newRun('knight'); const a = { uid: 8, key: 'shield', lvl: 1, hp: 3500, badges: [] }, b2 = { uid: 9, key: 'sniper', lvl: 1, hp: 1000, badges: [] }; R2.mons.push(a, b2); const r = M.ritual(R2, a, b2); out.ritual = [r.ok, R2.mons.length, b2.badges.length]; }
    // Huy hiệu: Thành Lũy +1000 HP tối đa, Đề Phòng 12 Khiên
    { const u = M.mkUnit('a', 'sniper', { x: 1, y: 1, badges: ['bulwark', 'precaution'] }); out.badge = [u.max, u.shield]; }
    return out;
  });
  check('Bùa Chú: pháo đầu trận 975 + 130 x 2 quái sau lưng cùng hàng = 1235', sk.cannon === 1235, String(sk.cannon));
  check('Bắn Tỉa: kỹ năng gài đòn kế 825 và đòn đó trúng 825', sk.snipeSet && sk.snipe === 825, JSON.stringify([sk.snipeSet, sk.snipe]));
  check('Xẻng Đào Tiền Tuyến hồi 500 HP; Khiên Đế Quốc cho 5 Khiên mình và 3 cho quái kề', sk.heal500 === 500 && sk.formation[0] === 5 && sk.formation[1] === 3, JSON.stringify([sk.heal500, sk.formation]));
  check('Kiếm Thủ Hộ 228 lên địch trong tầm và hồi 4,5% cho đồng đội kề', sk.sword[0] === 228 && sk.sword[1] === 4.5, JSON.stringify(sk.sword));
  check('Đại Tư Tế: sét trúng 3 địch; lần dùng thứ 2 gây choáng', sk.lightning === 3 && sk.stun >= 1, JSON.stringify([sk.lightning, sk.stun]));
  check('Goblin Xung Phong đầu trận: 600 sát thương (kèm đòn thường kế) và đẩy lùi 4 ô (chạm biên thì dừng)', sk.charge[0] >= 600 && sk.charge[0] <= 900 && sk.charge[1] === sk.charge[2] && sk.charge[1] > 0, JSON.stringify(sk.charge));
  check('Trùm Bóng Chày: 4 lần dùng kỹ năng triệu hồi 1 Khỉ Bàn Tay Vàng', sk.summon === 1, String(sk.summon));
  check('gộp quái cùng loại: lên cấp 2, HP x1,3, không tốn quy mô; quy mô đầy thì từ chối "Không thể chiêu mộ thêm quái."', sk.merge[0] && sk.merge[1] && sk.merge[2] === 2 && sk.merge[3] && sk.merge[4] === Math.round(2000 * 1.3) && !sk.full[0] && sk.full[1] === 'Không thể chiêu mộ thêm quái.', JSON.stringify([sk.merge, sk.full]));
  check('quái chết trong trận mất hẳn khỏi đội và vào danh sách đã mất', sk.dead[0] === false && sk.dead[1] === 0 && sk.dead[2] === 1, JSON.stringify(sk.dead));
  check('cửa hàng: thiếu Vàng thì từ chối, đủ thì trừ đúng giá (12) và cộng 6 thức ăn', sk.shop[0] === false && sk.shop[1] === 'Bạn không đủ Vàng.' && sk.shop[2] && sk.shop[3] === 88 && sk.shop[4] === 6, JSON.stringify(sk.shop));
  check('nghỉ ngơi hồi 30% HP tối đa; bữa ăn hồi 60% và tốn 2 thức ăn', sk.rest[0] === 100 + Math.round(3500 * 0.3) && sk.rest[1] === 100 + Math.round(3500 * 0.6) && sk.rest[2] === 2, JSON.stringify(sk.rest));
  check('nghi lễ: quái bên trái hi sinh (còn 1 quái), quái bên phải nhận 1 huy hiệu', sk.ritual[0] && sk.ritual[1] === 1 && sk.ritual[2] === 1, JSON.stringify(sk.ritual));
  check('huy hiệu: Thành Lũy +1000 HP tối đa (1000 -> 2000), Đề Phòng 12 Khiên', sk.badge[0] === 2000 && sk.badge[1] === 12, JSON.stringify(sk.badge));

  // ---- 3. thắng bằng click thật cả ván
  // Dọn đội cho khoẻ để đủ sức hạ đội quán quân (đo cân bằng riêng); đi hết bản đồ bằng click thật.
  await ev(() => {
    const M = SK.monsterrise, R = M.R; M.seed(21);
    R.cap = 40; R.coins = 400; R.food = 400;
    for (const k of ['priest', 'executor', 'spader', 'savior', 'guardian', 'sniper', 'shield']) { const r = M.recruit(R, k); if (r.rec) { M.give(R, r.rec, 'sunder'); M.give(R, r.rec, 'precaution'); r.rec.hp = M.maxHp(r.rec); } }
    for (const r of R.mons) r.hp = M.maxHp(r);
  });
  let steps = 0, shotsDone = {};
  while (steps++ < 160) {
    const st = await ev(() => { const R = SK.monsterrise.R; return { over: R.over, screen: R.screen, state: SK.G.state, boss: false }; });
    if (st.over || await ev(() => !document.getElementById('sk-win').hidden)) break;
    if (st.screen === 'map') {
      const id = await ev(() => { const el = [...document.querySelectorAll('#mr [data-node]:not([disabled])')].sort((a, b) => 0)[0]; return el && el.dataset.node; });
      if (!id) { check('bản đồ luôn có điểm bấm được', false, 'screen map nhưng không có node'); break; }
      // ưu tiên điểm không phải trận phụ để chạy nhanh: nghỉ / cửa hàng / sự kiện tuỳ ý, vẫn bấm thật
      await p.click('#mr [data-node="' + id + '"]');
    } else if (st.screen === 'prep') {
      if (!shotsDone.prep) { shotsDone.prep = 1; await ev(() => document.getElementById('mr-auto').click()); await sleep(300); await p.screenshot({ path: path.join(SHOTS, '3-prep.png') }); }
      await p.click('#mr-auto'); await p.click('#mr-go');
    } else if (st.screen === 'battle') {
      await p.click('#mr [data-speed="4"]');
      await ev(() => { if (SK.monsterrise.B) SK.monsterrise.B.speed = 60; });
      if (!shotsDone.bat && await ev(() => SK.monsterrise.R.boss)) { shotsDone.bat = 1; await ev(() => { SK.monsterrise.B.speed = 1; }); await sleep(1500); await p.screenshot({ path: path.join(SHOTS, '4-battle.png') }); await ev(() => { SK.monsterrise.B.speed = 60; }); }
      await until(p, () => SK.monsterrise.R.screen !== 'battle', null, 60000);
    } else if (st.screen === 'result') {
      await p.click('#mr-next');
    } else if (st.screen === 'shop') {
      if (!shotsDone.shop) { shotsDone.shop = 1; await p.screenshot({ path: path.join(SHOTS, '5-shop.png') }); }
      await p.click('#mr-leave');
    } else if (st.screen === 'rest') { await p.click('#mr-rest'); }
    else if (st.screen === 'ritual') { await p.click('#mr-leave'); }
    else if (st.screen === 'event') {
      const done = await ev(() => SK.monsterrise.R.event.done);
      if (done) await p.click('#mr-leave'); else await p.click('#mr [data-ev="b"]');
    }
    await sleep(30);
  }
  const win = await ev(() => ({ ends: window.__ends.slice(), winVisible: !document.getElementById('sk-win').hidden, overVisible: !document.getElementById('sk-over').hidden, info: document.getElementById('sk-win-info').textContent, floor: SK.monsterrise.R.floor, rooms: SK.monsterrise.R.stats.rooms, battles: SK.monsterrise.R.stats.battles, mrHidden: document.getElementById('mr').hidden }));
  check('thắng cả ván bằng click thật: qua 3 tầng, hạ đội quán quân, runEnd.won = true đúng một lần, màn Chiến thắng hiện', win.ends.length === 1 && win.ends[0].won === true && win.winVisible && !win.overVisible && win.floor === 2 && win.mrHidden, JSON.stringify(win));
  await p.screenshot({ path: path.join(SHOTS, '6-win.png') });
  if (!win.winVisible) console.log('DIAG', JSON.stringify(await ev(() => ({ R: { screen: SK.monsterrise.R.screen, floor: SK.monsterrise.R.floor, cur: SK.monsterrise.R.cur, mons: SK.monsterrise.R.mons.length, over: SK.monsterrise.R.over }, st: SK.G.state, bt: SK.monsterrise.R.bt })), win));
  const drawn = await ev(() => Object.keys(SK.monsterrise.drawn));
  check('quái vẽ bằng hình gốc: prefab M_* của monster_rise.ab (>= 6 loại đã vẽ)', drawn.length >= 6 && drawn.every(k => /^M_/.test(k)), drawn.join(','));

  // ---- 4. thua bằng trận thật
  const gems0 = await ev(() => SK.profile.gems);
  await p.click('#sk-win-retry');
  await until(p, () => SK.G.state === 'lobby', null, 6000);
  const dlg = await until(p, () => !!document.getElementById('hs-claim'), null, 4000);
  const dtxt = dlg ? await ev(() => document.querySelector('.hs-modal') && document.querySelector('.hs-modal').textContent.slice(0, 120)) : '';
  if (dlg) await p.click('#hs-claim');
  const gems1 = await ev(() => SK.profile.gems);
  const got = +((/\+(\d+)/.exec(dtxt) || [])[1] || 0);
  check('thắng: bảng tổng kết lượt chơi (Chiến thắng!) hiện qua runEnd thật, có đá quý thưởng (wiki: thưởng Gems khi thắng hoặc thua) và hồ sơ đã nhận', dlg && /Chiến thắng/.test(dtxt) && got > 100 && gems1 >= got, JSON.stringify({ gems0, gems1, got, dtxt }));
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="monsterrise"]');
  await p.click('#hs-mode-go');
  await until(p, () => SK.G.state === 'monsterrise' && document.querySelector('#mr [data-start]'), null, 8000);
  await p.click('#mr [data-start] button:not([disabled])'); await p.click('#mr [data-start] button:not([disabled])');
  await ev(() => { const R = SK.monsterrise.R; SK.monsterrise.seed(4); R.mons.forEach(r => { r.hp = 1; }); });
  for (let i = 0; i < 6; i++) {
    const sc = await ev(() => SK.monsterrise.R.screen);
    if (sc === 'map') { const id = await ev(() => document.querySelector('#mr [data-node]:not([disabled])').dataset.node); await p.click('#mr [data-node="' + id + '"]'); }
    else if (sc === 'prep') { await p.click('#mr-auto'); await p.click('#mr-go'); await ev(() => { SK.monsterrise.B.speed = 60; }); await until(p, () => SK.monsterrise.R.screen === 'result', null, 60000); break; }
    else if (sc === 'shop' || sc === 'ritual') await p.click('#mr-leave');
    else if (sc === 'rest') await p.click('#mr-rest');
    else if (sc === 'event') { const dn = await ev(() => SK.monsterrise.R.event.done); await p.click(dn ? '#mr-leave' : '#mr [data-ev="b"]'); }
    await sleep(40);
  }
  const res = await ev(() => ({ screen: SK.monsterrise.R.screen, text: document.querySelector('#mr-main h2') && document.querySelector('#mr-main h2').textContent, ends: window.__ends.length }));
  check('thua một trận thật: màn Thất Bại, chưa có runEnd mới', res.screen === 'result' && res.text === 'Thất Bại' && res.ends === 1, JSON.stringify(res));
  await p.screenshot({ path: path.join(SHOTS, '7-lose.png') });
  await p.click('#mr-next');
  const lose = await ev(() => ({ ends: window.__ends.slice(), over: !document.getElementById('sk-over').hidden, win: !document.getElementById('sk-win').hidden, gems: SK.profile.gems != null }));
  check('kết thúc thua: runEnd.won = false (lần 2), màn "Bạn đã gục ngã" hiện, không hiện màn thắng', lose.ends.length === 2 && lose.ends[1].won === false && lose.over && !lose.win, JSON.stringify(lose));
  await p.click('#sk-retry');
  await until(p, () => SK.G.state === 'lobby', null, 6000);
  if (await until(p, () => !!document.getElementById('hs-claim'), null, 3000)) await p.click('#hs-claim');
  check('về sảnh sau ván: state lobby, giao diện chế độ ẩn', await ev(() => SK.G.state === 'lobby' && document.getElementById('mr').hidden));

  check('không lỗi trang / console', errs.length === 0, errs.slice(0, 4).join(' | '));
  console.log(results.join('\n'));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail + '  (ảnh: ' + SHOTS + ')');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
