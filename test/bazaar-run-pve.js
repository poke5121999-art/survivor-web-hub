/*
 * Chợ Phiên — kiểm nhánh rulesB của js/run: quái giờ PvE theo ngày (RUN-02), XP khi thua (RUN-06), kỹ năng hợp nhất (RUN-07),
 * kỹ năng mồ côi (CONTENT-05), thẻ chỉ có trên bàn boss (CONTENT-06), bể quái muộn (CONTENT-07).
 * Chạy:  node test/bazaar-run-pve.js        (BZ_ROOT=<thư mục gốc khác> để chạy trên bản cũ)
 * Mọi số kỳ vọng là chữ trong wiki Monsters / dữ liệu, không tính lại bằng chính mã đang kiểm.
 */
'use strict';
const path = require('path');
const ROOT = process.env.BZ_ROOT || path.resolve(__dirname, '..');
['cards', 'monsters', 'mode', 'encounters', 'shops'].forEach(f => require(path.join(ROOT, 'games/bazaar/data/' + f + '.js')));
try { require(path.join(ROOT, 'games/bazaar/data/heroes.js')); } catch (e) { /* khởi đầu chung */ }
const R = require(path.join(ROOT, 'games/bazaar/js/run/index.js'));
const BZ = globalThis.BZSim;
const dayNamesOf = d => (R.ENCOUNTERS.combat.dayNames ? R.ENCOUNTERS.combat.dayNames(d) : []);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '  → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
}
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); }
const baseRun = (hero, seed) => R.newRun({ hero: hero || 'Vanessa', seed: seed || 42 });
function optionNames(day, seeds, sel) {
  const names = {}, tiers = {};
  for (let s = 1; s <= seeds; s++) {
    const run = baseRun('Vanessa', s); run.day = day;
    R.ENCOUNTERS.combat.options(run).forEach(o => { names[o.name] = 1; tiers[o.tier] = 1; });
  }
  return Object.keys(sel === 'tiers' ? tiers : names).sort();
}
const HEROES_ALL_TEST = ['Vanessa', 'Pygmalien', 'Dooley', 'Mak', 'Stelle', 'Jules', 'Karnok'];
const ANY_SKILL = { kind: 'skill', tiers: null, sizes: null, any: [], not: [], hero: null, names: [] };

console.log('RUN-02 quái giờ PvE theo ngày (wiki Monsters)');
eq('ngày 1: chỉ 6 quái của wiki, không quái Vàng',
  optionNames(1, 300), ['Banannibal', 'Fanged Inglet', 'Haunted Kimono', 'Kyver Drone', 'Pyro', 'Viper']);
eq('ngày 1: chỉ bậc Bronze / Silver', optionNames(1, 300, 'tiers'), ['Bronze', 'Silver']);
eq('ngày 2: chỉ 6 quái của wiki',
  optionNames(2, 400), ['Boarrior', 'Coconut Crab', 'Covetous Thief', 'Giant Mosquito', 'Rogue Scrapper', 'Ventriloquist']);
{
  const d3 = optionNames(3, 400);
  check('ngày 3: Tempest Bravo / Overbearing Teacher (ngoài wiki) không ra', d3.indexOf('Tempest Bravo') < 0 && d3.indexOf('Overbearing Teacher') < 0, d3);
  const d2 = optionNames(2, 400);
  check('ngày 2: Mutant Baker và Mimic không ra', d2.indexOf('Mutant Baker') < 0 && d2.indexOf('Mimic') < 0, d2);
  eq('ngày 7: bảng có đúng 10 tên của wiki', dayNamesOf(7).length, 10);
  eq('ngày 1: mỗi lần chia đủ 3 quái khác nhau',
    [1, 2, 3, 4, 5].map(s => { const r = baseRun('Vanessa', s); r.day = 1; return new Set(R.ENCOUNTERS.combat.options(r).map(o => o.id)).size; }), [3, 3, 3, 3, 3]);
}

console.log('CONTENT-07 bể quái muộn (sau ngày 10)');
{
  const late = optionNames(12, 600);
  ['Trash Titan', 'Void Golem', 'Morguloth', 'Lord Arken', 'Awakened District'].forEach(n =>
    check('ngày 12: ' + n + ' xuất hiện trong 600 lần chia', late.indexOf(n) >= 0, late));
  check('ngày 9: Morguloth chưa ra', optionNames(9, 400).indexOf('Morguloth') < 0, 'có');
}

console.log('CONTENT-06 thẻ chỉ có trên bàn boss (loot sau khi hạ boss)');
{
  const cb = Object.values(R.enc().combats).filter(c => c.InternalName === 'Morguloth')[0];
  let sawSword = false;
  for (let s = 1; s <= 80 && !sawSword; s++) {
    const run = baseRun('Vanessa', s); run.day = 12;
    run.phase = { kind: 'fightResult', combatType: 'PVE', winner: 'player', won: true, endMs: 1, seed: 1, rewards: { gold: 6, xp: 6 },
      opponent: { kind: 'monster', name: 'Morguloth', monsterId: cb.Monster, combatId: cb.Id }, after: 'endHour' };
    const r = R.apply(run, { t: 'next' });
    sawSword = (r.run.phase.picks || []).some(p => { const c = p.card || p; return c.id && R.title(R.tpl(c.id)) === 'Sword of Swords'; });
  }
  check('hạ Morguloth: loot có Sword of Swords (chỉ nằm trên bàn Morguloth)', sawSword, 'không');
}

console.log('RUN-06 XP khi thua quái');
{
  const cbat = Object.values(R.enc().combats).filter(c => c.InternalName === 'Haunted Kimono')[0];
  const mon = BZ_MONSTERS.filter(m => m.Id === cbat.Monster)[0];
  const realRun = BZ.run;
  const lose = oppHealth => {
    BZ.run = function () { return { winner: 1, endMs: 5000, players: [{ health: 10, healthMax: 300 }, { health: oppHealth, healthMax: 200 }] }; };
    try {
      const run = baseRun();
      run.phase = { kind: 'fight', combatType: 'PVE', seed: 1, after: 'endHour',
        opponent: { kind: 'monster', name: 'Haunted Kimono', board: BZ.boardFromMonster(mon, 'm'), combatId: cbat.Id, monsterId: cbat.Monster, tier: 'Silver', rewards: { gold: 3, xp: 3 } } };
      const f = R.apply(run, { t: 'fight' });
      const n = R.apply(f.run, { t: 'next' });
      return [f.run.phase.rewards, n.run.xp - run.xp];
    } finally { BZ.run = realRun; }
  };
  eq('thua khi quái còn 80/200 máu (trừ 60%): 2 vàng theo máu + 3 XP (+1 XP của giờ)', lose(80), [{ gold: 2, xp: 3 }, 4]);
  eq('thua khi quái còn 150/200 máu (trừ 25%): không XP (chỉ +1 XP của giờ)', lose(150)[1], 1);
}

console.log('RUN-07 kỹ năng hợp nhất như vật phẩm');
{
  const sid = R.pool('skill').filter(id => { const t = R.tpl(id); return (t.Heroes || []).indexOf('Vanessa') >= 0 && t.StartingTier === 'Bronze' && Object.keys(t.Tiers).length >= 3; })[0];
  const stitle = R.title(R.tpl(sid));
  const own = (run, tier) => run.board.skills.push({ uid: 's1', id: sid, tier, ench: null, socket: 0, size: 1, section: 'skills', mods: {} });
  const run = baseRun(); own(run, 'Bronze');
  eq('fuseTarget: kỹ năng cùng id + cùng bậc Bronze trả bản đang có', (R.fuseTarget(run, sid, 'Bronze') || {}).uid, 's1');
  eq('fuseTarget: khác bậc trả null', R.fuseTarget(run, sid, 'Silver'), null);
  const got = R.gainCard({ run, events: [] }, { id: sid, tier: 'Bronze' });
  eq('gainCard kỹ năng trùng: lên Silver, vẫn 1 kỹ năng', [got && got.tier, run.board.skills.length], ['Silver', 1]);
  const d = R.deal(run, Object.assign({}, ANY_SKILL, { names: [stitle] }), 1, {});
  eq('deal không loại kỹ năng đã có; bậc theo bản đang có (Silver)', d.map(c => [c.id, c.tier]), [[sid, 'Silver']]);
  const gm = Object.values(R.enc().events).filter(e => e.InternalName === 'Grandmaster')[0];
  const run2 = baseRun('Vanessa', 7); own(run2, 'Silver');
  eq('Grandmaster "Sells Skill upgrades": bày bản nâng của kỹ năng đang có',
    R.ENCOUNTERS.merchant.dealStock(run2, gm).map(s => [s.card.id, s.card.tier]), [[sid, 'Silver']]);
}

console.log('CONTENT-05 kỹ năng mồ côi (khởi đầu Kim cương, thầy dạy theo dải bậc không chia)');
{
  const seen = {};
  for (let s = 1; s <= 600; s++) {
    const run = baseRun('Mak', s); run.day = 2;
    R.deal(run, ANY_SKILL, 3, { tierMode: 'band' }).forEach(c => { if (R.tpl(c.id).StartingTier === 'Diamond') seen[c.id] = c.tier; });
  }
  check('ngày 2 (dải Bronze): thầy dạy chia được kỹ năng khởi đầu Kim cương (trước: 0)', Object.keys(seen).length >= 8, Object.keys(seen).length);
  check('kỹ năng khởi đầu Kim cương chia ở đúng bậc Diamond', Object.keys(seen).every(id => seen[id] === 'Diamond'), seen);
  let crimson = false;
  for (let s = 1; s <= 3000 && !crimson; s++) {
    const run = baseRun('Mak', s); run.day = 2;
    crimson = R.deal(run, Object.assign({}, ANY_SKILL, { hero: 'Mak' }), 3, { tierMode: 'band' }).some(c => R.title(R.tpl(c.id)) === 'Crimson Dash');
  }
  check('Mak: Crimson Dash (Kim cương, mồ côi ở bản trước) ra được', crimson, 'không');
}

console.log('W-40 thẻ không có art trong game bị ẩn khỏi mọi bể (CONTENT-08)');
{
  const HIDDEN = ['Cyclops Eye', 'Sonic Cannon', 'Holo-Disguise Generator', 'Old Barrel', 'Yeti Claw', 'Acid Sprayer', 'Pyro Gauntlet',
    'Plasma Whip', 'Javalin', 'Poison Blades', 'Cybernetic Implants', 'Virulent Research'];
  const hid = {};
  Object.keys(globalThis.BZ_CARDS).forEach(id => { if (HIDDEN.indexOf(globalThis.BZ_CARDS[id].InternalName) >= 0) hid[id] = globalThis.BZ_CARDS[id].InternalName; });
  eq('dữ liệu có đủ 12 thẻ cần ẩn', Object.keys(hid).length, 12);
  eq('bảng TUNING.HIDDEN_CARDS đúng 12 tên, mỗi dòng có lý do', R.TUNING.HIDDEN_CARDS.map(h => h.name + (h.reason ? '' : '!')), HIDDEN);
  eq('R.pool(item)/R.pool(skill) không chứa thẻ ẩn', R.pool('item').concat(R.pool('skill')).filter(id => hid[id]), []);
  eq('R.isJunk đúng với cả 12 thẻ ẩn (cửa đồ rơi sau trận)', Object.keys(hid).filter(id => !R.isJunk(R.tpl(id))), []);
  const ANY_ITEM = { kind: 'item', tiers: null, sizes: null, any: [], not: [], hero: null, names: [] };
  const got = {};
  HEROES_ALL_TEST.forEach(hero => {
    for (let sd = 1; sd <= 40; sd++) for (const day of [1, 4, 7, 10]) {
      const run = baseRun(hero, sd); run.day = day;
      [ANY_ITEM, ANY_SKILL, Object.assign({}, ANY_ITEM, { hero }), Object.assign({}, ANY_SKILL, { hero })].forEach(f => {
        ['day', 'band'].forEach(tm => R.deal(run, f, 6, { tierMode: tm }).forEach(c => { if (hid[c.id]) got[hid[c.id]] = 1; }));
      });
    }
  });
  eq('chia bài (mọi hero, ngày 1/4/7/10, bộ lọc bất kỳ) không ra thẻ ẩn', Object.keys(got), []);
  const stock = {};
  Object.values(R.enc().events).forEach(e => {
    if (!R.ENCOUNTERS.merchant) return;
    for (let sd = 1; sd <= 8; sd++) {
      const run = baseRun('Vanessa', sd); run.day = 1 + sd;
      let st = []; try { st = R.ENCOUNTERS.merchant.dealStock(run, e) || []; } catch (x) { st = []; }
      st.forEach(x => { if (hid[x.card.id]) stock[hid[x.card.id]] = 1; });
    }
  });
  eq('mọi thương nhân/sự kiện không bày thẻ ẩn', Object.keys(stock), []);
  eq('tìm theo tên ("get a Yeti Claw") không trả thẻ ẩn', HIDDEN.map(n => R.findTitles(n)).filter(l => l.length && l.some(t => HIDDEN.indexOf(t) >= 0)), []);
}
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
