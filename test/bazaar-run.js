/*
 * Chợ Phiên (games/bazaar) — kiểm vòng chơi js/run/* (reducer thuần, tất định) bằng Node, không cần trình duyệt.
 * Chạy:  node test/bazaar-run.js              (mọi phần; quét bot 200 run mỗi hero, ~3-4 phút)
 *        SWEEP=20 node test/bazaar-run.js     bớt số run quét;  ONLY=rules|det|sweep  chỉ chạy một phần
 *
 * Số kỳ vọng tính tay từ dữ liệu:
 * - giá: game_modes.json StandardPrices (Small Bronze 2/1, Medium Silver 8/4, Large Gold 24/12, Small Legendary 24/12,
 *   kỹ năng Gold 20/10); bán = SellPrice của thẻ (bảng, không ghi đè).
 * - run mới: 8 vàng + 5 thu nhập [WIKI], 20 uy tín, 300 máu [clip PSP75k4R4Pk?t=123], ô tay mở 3,4,5,6.
 * - lên cấp ở 8 XP: máu +100 (level_ups Level 1), mở thêm ô 2 và 7 (BazaarDeckTools.cs:1170-1230).
 * - thua PvP ngày 4: uy tín 20 → 16.
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
['cards', 'monsters', 'mode', 'encounters'].forEach(f => require(path.join(ROOT, 'games/bazaar/data/' + f + '.js')));
const R = require(path.join(ROOT, 'games/bazaar/js/run/index.js'));
const BZ = globalThis.BZSim;
const ONLY = process.env.ONLY || '';
const SWEEP = +(process.env.SWEEP || 200);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '  → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
}
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); }

// ---------- thẻ tổng hợp (không phụ thuộc giá ghi đè của thẻ thật) ----------
const TIERS = {};
['Bronze', 'Silver', 'Gold', 'Diamond', 'Legendary'].forEach(t => { TIERS[t] = { Attributes: {}, AbilityIds: [], AuraIds: [], TooltipIds: [] }; });
function tpl(id, size, extra) {
  return Object.assign({ $type: 'TCardItem', Type: 'Item', Id: id, InternalName: id, StartingTier: 'Bronze', Size: size, Heroes: ['Common'],
    Tags: [], HiddenTags: [], Localization: { Title: { Text: id }, Tooltips: [] }, Abilities: {}, Auras: {}, Tiers: JSON.parse(JSON.stringify(TIERS)) }, extra || {});
}
BZ.extraCards = Object.assign(BZ.extraCards || {}, {
  tSmall: tpl('tSmall', 'Small'), tMed: tpl('tMed', 'Medium'), tLarge: tpl('tLarge', 'Large'),
  tSkill: tpl('tSkill', 'Medium', { $type: 'TCardSkill', Type: 'Skill' }),
  // "Khi bán thẻ này: +5 vàng" (mẫu Raffle Ticket: TTriggerOnCardSold Subject Self → TActionPlayerModifyAttribute Gold)
  tSoldGold: tpl('tSoldGold', 'Small', { Abilities: { 0: { Id: '0', ActiveIn: 'HandAndStash', WorksIn: 'Anywhere', Priority: 'Medium',
    Trigger: { $type: 'TTriggerOnCardSold', Subject: { $type: 'TTargetCardSelf' } },
    Action: { $type: 'TActionPlayerModifyAttribute', AttributeType: 'Gold', Operation: 'Add', Value: { $type: 'TFixedValue', Value: 5 },
      Target: { $type: 'TTargetPlayerAbsolute', TargetMode: 'Player' } } } } })
});
BZ.extraCards.tSoldGold.Tiers.Bronze.AbilityIds = ['0'];

function baseRun(hero) {
  const run = R.newRun({ hero: hero || 'Vanessa', seed: 42 });
  return run;
}
function inst(run, id, section, socket, tier) {
  const t = R.tpl(id);
  run.uidN++;
  const ci = { uid: 'p' + run.uidN, id, tier: tier || 'Bronze', ench: null, socket, size: R.SIZE[t.Size] || 1, section, mods: {} };
  run.board[section].push(ci);
  return ci;
}
function merchantPhase(stock) {
  const anyMerchant = Object.values(globalThis.BZ_ENCOUNTERS.events).find(e => e.Kind === 'merchant' && e.InternalName === 'Jay Jay');
  return { kind: 'merchant', merchantId: anyMerchant.Id, name: 'test', desc: '', stock, rerolls: 1, rerollCost: 2, rerollStep: 0, rerollMax: null,
    dealt: [], after: 'endHour' };
}
function types(r) { return r.events.map(e => e.type); }

function rules() {
  console.log('\n# Luật');
  // run mới
  let run = baseRun('Vanessa');
  eq('run mới: số khởi đầu', [run.v, run.hero, run.day, run.hour, run.gold, run.income, run.level, run.xp, run.prestige, run.wins, run.losses, run.healthMax],
    [1, 'Vanessa', 1, 0, 8, 5, 1, 0, 20, 0, 0, 300]);
  eq('máu cấp 1 = 300 (clip PSP75k4R4Pk?t=123); cấp 2,3,5,7,9 cộng dồn level_ups', [1, 2, 3, 5, 7, 9].map(R.hpAtLevel), [300, 400, 550, 1000, 1650, 2600]);
  eq('run mới: pha mở màn 3 lựa chọn, không thoát', [run.phase.kind, run.phase.choices.map(c => c.key), run.phase.canExit], ['event', ['income', 'item', 'skill'], false]);
  eq('run mới: ô tay mở 3..6', R.unlockedSockets(1).map((b, i) => b ? i : -1).filter(i => i >= 0), [3, 4, 5, 6]);
  eq('heroSelect không truyền hero', R.newRun({ seed: 1 }).phase.kind, 'heroSelect');
  check('hero không chơi được bị từ chối', !R.apply(R.newRun({ seed: 1 }), { t: 'pickHero', hero: 'Mak' }).ok);
  const r0 = R.apply(run, { t: 'choose', i: 0 });
  eq('mở màn Thu nhập: 8+12 vàng, 5+2 thu nhập, sang giờ 0 chọn gặp gỡ', [r0.run.gold, r0.run.income, r0.run.phase.kind, r0.run.phase.options.length], [20, 7, 'choose', 3]);
  check('lệnh sai pha bị từ chối, run không đổi', !R.apply(run, { t: 'fight' }).ok && R.apply(run, { t: 'fight' }).run === run);

  // bảng giá
  const P = (id, tier) => { const p = R.price({ id }, tier); return [p.buy, p.sell]; };
  eq('giá Small Bronze', P('tSmall', 'Bronze'), [2, 1]);
  eq('giá Medium Silver', P('tMed', 'Silver'), [8, 4]);
  eq('giá Large Gold', P('tLarge', 'Gold'), [24, 12]);
  eq('giá Small Legendary', P('tSmall', 'Legendary'), [24, 12]);
  eq('giá Large Diamond', P('tLarge', 'Diamond'), [48, 24]);
  eq('giá kỹ năng Gold', P('tSkill', 'Gold'), [20, 10]);
  const sp = R.mode().StandardPrices;
  eq('giá khớp BZ_MODE.mode.StandardPrices (Medium Gold)', P('tMed', 'Gold'), [sp.ItemBuyPrices.Medium.Gold, sp.ItemSellPrices.Medium.Gold]);
  const ov = Object.values(globalThis.BZ_CARDS).find(t => Object.keys(t.Tiers || {}).some(k => t.Tiers[k].Attributes && t.Tiers[k].Attributes.BuyPrice != null));
  if (ov) {
    const k = Object.keys(ov.Tiers).find(k2 => ov.Tiers[k2].Attributes && ov.Tiers[k2].Attributes.BuyPrice != null);
    eq('giá ghi đè theo bậc (' + ov.InternalName + ' ' + k + ')', R.price(ov, k).buy, ov.Tiers[k].Attributes.BuyPrice);
  }

  // mua
  run = baseRun(); run.gold = 8;
  run.phase = merchantPhase([{ card: { id: 'tSmall', tier: 'Bronze', ench: null }, price: 2 }, { card: { id: 'tMed', tier: 'Bronze', ench: null }, price: 99 }]);
  let r = R.apply(run, { t: 'buy', i: 0 });
  eq('mua: trừ 2 vàng, thẻ vào ô tay mở đầu tiên (3)', [r.ok, r.run.gold, r.run.board.hand.map(c => [c.id, c.socket])], [true, 6, [['tSmall', 3]]]);
  check('mua: phát sự kiện buy + gold −2', types(r).indexOf('buy') >= 0 && r.events.some(e => e.type === 'gold' && e.delta === -2), types(r));
  eq('mua: ô hàng đã bán biến mất', r.run.phase.stock.length, 1);
  check('mua: input không bị sửa', run.gold === 8 && run.board.hand.length === 0);
  r = R.apply(r.run, { t: 'buy', i: 0 });
  eq('mua: thiếu vàng bị từ chối', [r.ok, /not enough gold/.test(r.events[0].reason)], [false, true]);
  // hết chỗ: tay 3..6 = hai Medium, kho 10 = ba Large + một Small
  run = baseRun(); run.gold = 50;
  inst(run, 'tMed', 'hand', 3); inst(run, 'tMed', 'hand', 5);
  inst(run, 'tLarge', 'stash', 0); inst(run, 'tLarge', 'stash', 3); inst(run, 'tLarge', 'stash', 6); inst(run, 'tSmall', 'stash', 9, 'Silver');
  run.phase = merchantPhase([{ card: { id: 'tSmall', tier: 'Bronze', ench: null }, price: 2 }]);
  r = R.apply(run, { t: 'buy', i: 0 });
  eq('mua: hết chỗ bị từ chối, vàng giữ nguyên', [r.ok, /no space/.test(r.events[0].reason), r.run.gold], [false, true, 50]);
  // nhập (fuse): đã có tSmall Silver → mua tSmall Silver thì bản cũ lên Gold, không chiếm ô
  run.phase = merchantPhase([{ card: { id: 'tSmall', tier: 'Silver', ench: null }, price: 4 }]);
  r = R.apply(run, { t: 'buy', i: 0 });
  eq('mua trùng id + bậc: nhập lên một bậc', [r.ok, r.run.board.stash.find(c => c.id === 'tSmall').tier, r.run.gold], [true, 'Gold', 46]);
  // kỹ năng vào ô kỹ năng
  run = baseRun(); run.gold = 50;
  run.phase = merchantPhase([{ card: { id: 'tSkill', tier: 'Bronze', ench: null }, price: 5 }, { card: { id: 'tSkill', tier: 'Bronze', ench: null }, price: 5 }]);
  r = R.apply(run, { t: 'buy', i: 0 });
  eq('mua kỹ năng: vào skills', [r.ok, r.run.board.skills.length, r.run.board.hand.length], [true, 1, 0]);
  eq('mua kỹ năng đã có: bị từ chối', R.apply(r.run, { t: 'buy', i: 0 }).ok, false);

  // bán
  run = baseRun(); run.gold = 8; run.phase = merchantPhase([]);
  const s1 = inst(run, 'tSmall', 'hand', 4, 'Silver');
  r = R.apply(run, { t: 'sell', uid: s1.uid });
  const sev = r.events.find(e => e.type === 'sell');
  eq('bán Small Silver: +2 vàng, sự kiện sell', [r.ok, r.run.gold, sev && sev.uid, sev && sev.gold, r.run.board.hand.length], [true, 10, s1.uid, 2, 0]);
  const s2 = inst(run, 'tSoldGold', 'stash', 0);
  r = R.apply(run, { t: 'sell', uid: s2.uid });
  eq('bán thẻ "khi bán: +5 vàng" (ngoài trận qua DSL của sim): 8 + 1 + 5', [r.ok, r.run.gold, types(r).indexOf('trigger') >= 0], [true, 14, true]);
  const sk = inst(run, 'tSkill', 'skills', 0);
  eq('kỹ năng không bán được', R.apply(run, { t: 'sell', uid: sk.uid }).ok, false);

  // xếp chỗ
  run = baseRun(); run.phase = merchantPhase([]);
  const m1 = inst(run, 'tMed', 'hand', 3);
  const sm = inst(run, 'tSmall', 'hand', 5);
  eq('move Medium vào ô 6 (6,7; 7 đang khoá) bị từ chối', R.apply(run, { t: 'move', uid: m1.uid, section: 'hand', socket: 6 }).ok, false);
  eq('move Medium đè lên Small (4,5) bị từ chối', R.apply(run, { t: 'move', uid: m1.uid, section: 'hand', socket: 4 }).ok, false);
  eq('move Medium vào ô 2 (đang khoá) bị từ chối', R.apply(run, { t: 'move', uid: m1.uid, section: 'hand', socket: 2 }).ok, false);
  r = R.apply(run, { t: 'move', uid: sm.uid, section: 'hand', socket: 6 });
  eq('move Small 5 → 6', [r.ok, r.run.board.hand.find(c => c.uid === sm.uid).socket], [true, 6]);
  r = R.apply(r.run, { t: 'move', uid: m1.uid, section: 'hand', socket: 4 });
  eq('move Medium 3 → 4 (4,5 trống sau khi Small đi)', [r.ok, r.run.board.hand.find(c => c.uid === m1.uid).socket], [true, 4]);
  eq('move Medium vào kho ô 9 (9,10 vượt) bị từ chối', R.apply(run, { t: 'move', uid: m1.uid, section: 'stash', socket: 9 }).ok, false);
  r = R.apply(run, { t: 'move', uid: m1.uid, section: 'stash', socket: 8 });
  eq('move Medium vào kho ô 8', [r.ok, r.run.board.stash.map(c => c.socket), r.run.board.hand.length], [true, [8], 1]);

  // lên cấp ở 8 XP: rời thương nhân → hết giờ +1 XP
  run = baseRun(); run.xp = 7; run.phase = merchantPhase([]);
  r = R.apply(run, { t: 'leave' });
  eq('8 XP: cấp 2, máu 300+100, ô mở 2..7', [r.run.level, r.run.healthMax, R.unlockedSockets(r.run.level).map((b, i) => b ? i : -1).filter(i => i >= 0)],
    [2, 400, [2, 3, 4, 5, 6, 7]]);
  eq('8 XP: sự kiện levelUp, pha lên cấp chen vào đầu giờ 1', [types(r).indexOf('levelUp') >= 0, r.run.phase.kind, r.run.hour, r.run.phase.choices.length > 0],
    [true, 'levelUp', 1, true]);
  eq('ô mở cấp 3 / 4', [R.unlockedSockets(3).filter(Boolean).length, R.unlockedSockets(4).filter(Boolean).length, R.unlockedSockets(9).filter(Boolean).length], [8, 10, 10]);
  run.xp = 15; run.level = 1;
  r = R.apply(run, { t: 'leave' });
  eq('16 XP từ cấp 1: lên 2 cấp, +100 +150 máu, 2 phần thưởng chờ', [r.run.level, r.run.healthMax, r.run.pendingLevelUps], [3, 550, 2]);
  const lu = R.apply(r.run, { t: 'choose', i: 0 });
  check('chọn phần thưởng lên cấp không tốn giờ', lu.ok && lu.run.hour === 1 && lu.run.pendingLevelUps === 1, { ok: lu.ok, hour: lu.run.hour, p: lu.run.pendingLevelUps, ev: lu.events });

  // PvP: thua ngày 4 → −4 uy tín; thắng → +1 trận
  const pvp = (won, day, prestige, wins) => {
    const x = baseRun(); x.day = day; x.hour = 5; x.prestige = prestige; x.wins = wins;
    x.phase = { kind: 'fightResult', combatType: 'PVP', winner: won ? 'player' : 'opponent', won, endMs: 1, seed: 1, rewards: {}, opponent: { kind: 'ghost', name: 'g' }, after: 'endHour' };
    return R.apply(x, { t: 'next' });
  };
  r = pvp(false, 4, 20, 0);
  eq('thua PvP ngày 4: uy tín 20 → 16, thua 1, sang ngày 5', [r.run.prestige, r.run.losses, r.run.day, r.run.hour], [16, 1, 5, 0]);
  check('thua PvP: sự kiện prestige −4', r.events.some(e => e.type === 'prestige' && e.delta === -4));
  r = pvp(true, 4, 20, 3);
  eq('thắng PvP: 4 trận thắng, uy tín giữ', [r.run.wins, r.run.prestige], [4, 20]);
  // hết run theo ba cách
  eq('hết run: trận thắng thứ 10', [pvp(true, 7, 20, 9).run.phase.kind, pvp(true, 7, 20, 9).run.phase.reason], ['end', 'victory']);
  // Fates: lần đầu uy tín về <= 0 → về 1, pha 'fates' 3 lựa chọn (hình như lên cấp); lần hai → hết run
  r = pvp(false, 4, 3, 2);
  eq('Fates: uy tín 3 − 4 → 1, ghi fatesUsed, pha qua giờ kế là fates', [r.run.prestige, r.run.fatesUsed, r.run.phase.kind, r.run.day], [1, true, 'fates', 5]);
  eq('Fates: 3 lựa chọn cùng hình lên cấp, sự kiện fates', [r.run.phase.choices.length, r.run.phase.choices.map(c => [c.type, c.kind, c.tier, typeof c.id, typeof c.name, typeof c.desc].join()).every(x => /^fate,fate,Legendary,string,string,string$/.test(x)), types(r).indexOf('fates') >= 0],
    [3, true, true]);
  const fa = R.apply(r.run, { t: 'choose', i: 0 });
  eq('Fates: chọn xong chạy tiếp (giờ 0 ngày 5), uy tín giữ 1', [fa.ok, fa.run.phase.kind, fa.run.day, fa.run.hour, fa.run.prestige], [true, 'choose', 5, 0, 1]);
  const fh = R.apply(r.run, { t: 'choose', i: 1 });
  eq('Fates "Second Wind": +50 máu × cấp 1', [fh.run.healthMax - r.run.healthMax], [50]);
  eq('Fates: lệnh sai bị từ chối', [R.apply(r.run, { t: 'choose', i: 9 }).ok, R.apply(r.run, { t: 'leave' }).ok], [false, false]);
  const f2 = baseRun(); f2.day = 5; f2.hour = 5; f2.prestige = 1; f2.fatesUsed = true;
  f2.phase = { kind: 'fightResult', combatType: 'PVP', winner: 'opponent', won: false, endMs: 1, seed: 1, rewards: {}, opponent: { kind: 'ghost', name: 'g' }, after: 'endHour' };
  r = R.apply(f2, { t: 'next' });
  eq('Fates lần hai: uy tín về 0 → hết run "prestige"', [r.run.phase.kind, r.run.phase.reason, r.run.prestige], ['end', 'prestige', 0]);
  const lg = baseRun(); lg.prestige = 1; lg.fatesUsed = true; inst(lg, 'tSmall', 'hand', 4, 'Bronze'); inst(lg, 'tSmall', 'hand', 5, 'Silver'); inst(lg, 'tSmall', 'stash', 0, 'Gold');
  const lc = { run: lg, events: [] }; R.enterFates(lc);
  const lr = R.apply(lc.run, { t: 'choose', i: 0 });
  eq('Fates "Fate Legacy": Bronze/Silver → Gold', lr.run.board.hand.concat(lr.run.board.stash).map(c => c.tier), ['Gold', 'Gold', 'Gold']);
  // thua quái giữ vàng theo máu quái đã trừ: mỗi HealthMax/(vàng+1) = +1 vàng (CODE-COMBAT §1.12; clip oVtvrCdqHEE?t=297)
  eq('lossGold: 5 vàng, quái 600 máu: còn 250 → 3; còn 0 → 5; còn 600 → 0; còn 599 → 0', [R.lossGold(5, 600, 250), R.lossGold(5, 600, 0), R.lossGold(5, 600, 600), R.lossGold(5, 600, 599)], [3, 5, 0, 0]);
  const lf = baseRun(); lf.hour = 2; inst(lf, Object.values(globalThis.BZ_CARDS).find(t => t.InternalName === 'Basilisk Fang').Id, 'hand', 3);
  lf.phase = { kind: 'fight', combatType: 'PVE', seed: 7, after: 'endHour', opponent: { kind: 'monster', name: 'dummy', monsterId: null, combatId: null, rewards: { gold: 9, xp: 3 }, board: { name: 'dummy', healthMax: 1000, cards: [] } } };
  r = R.apply(lf, { t: 'fight' });
  eq('thua quái (cọc 1000 máu, thưởng 9 vàng, bị bão cát hạ khi còn 578): vàng thua = floor(422/100) = 4, không XP', [r.run.phase.won, r.run.phase.rewards], [false, { gold: 4 }]);
  r = R.apply(r.run, { t: 'next' });
  eq('thua quái: nhận 4 vàng, chỉ 1 XP của giờ (không 3 XP quái), sang giờ 3', [r.run.gold, r.run.xp, r.run.hour], [8 + 4, 1, 3]);

  r = pvp(true, 10, 20, 5);
  eq('hết run: qua ngày 10', [r.run.phase.kind, r.run.phase.reason], ['end', 'days']);
  eq('pha end không nhận lệnh', R.apply(r.run, { t: 'next' }).ok, false);

  // quái giờ 2: ba lựa chọn Đồng / Bạc / Vàng+
  run = baseRun(); run.hour = 2; run.phase = merchantPhase([]); run.hour = 1;
  r = R.apply(run, { t: 'leave' });
  eq('giờ 2: ba quái, bậc Đồng / Bạc / Vàng+', [r.run.phase.kind, r.run.phase.options.map(o => o.type), r.run.phase.options.map(o => o.tier === 'Bronze' ? 'B' : o.tier === 'Silver' ? 'S' : 'G+')],
    ['choose', ['combat', 'combat', 'combat'], ['B', 'S', 'G+']]);
  const f0 = R.apply(r.run, { t: 'pick', i: 0 });
  eq('chọn quái → pha fight có seed', [f0.run.phase.kind, typeof f0.run.phase.seed], ['fight', 'number']);
  const f1 = R.apply(f0.run, { t: 'fight' });
  const replay = BZ.run(Object.assign({ boards: R.fightBoards(f1.run) }, f1.run.phase.simOpts));
  eq('fight: phát lại cùng seed + cùng bàn ra cùng kết quả', [replay.winner === 0 ? 'player' : replay.winner === 1 ? 'opponent' : 'draw', replay.endMs], [f1.run.phase.winner, f1.run.phase.endMs]);

  // bộ lọc từ mô tả thương nhân / đống đồ
  const E = globalThis.BZ_ENCOUNTERS.events, byName = n => Object.values(E).find(e => e.InternalName === n);
  const dealOf = (n, k) => { const x = baseRun('Vanessa'); x.day = 5; const e = byName(n); return R.deal(x, R.ENCOUNTERS.merchant.filter(e), k || 10, {}).map(c => R.tpl(c.id)); };
  check('Aila "Sells Weapons": mọi thẻ có tag Weapon', dealOf('Aila').every(t => t.Tags.indexOf('Weapon') >= 0), dealOf('Aila').map(t => t.InternalName));
  check('Ande "Sells Small items": mọi thẻ Small', dealOf('Ande').every(t => t.Size === 'Small'));
  check('Pol "Sells Large items": mọi thẻ Large', dealOf('Pol').every(t => t.Size === 'Large'));
  check('Kina "Sells non-Weapon items": không thẻ nào Weapon', dealOf('Kina').every(t => t.Tags.indexOf('Weapon') < 0));
  check('Goldie "Sells Gold-tier items": bậc Gold', (() => { const x = baseRun(); return R.deal(x, R.ENCOUNTERS.merchant.filter(byName('Goldie')), 5, {}).every(c => c.tier === 'Gold'); })());
  const teach = R.parseFilter(byName('Bjorn (Level Up)').Desc);
  eq('"Teaches Freeze skills" → kỹ năng, Freeze', [teach.kind, teach.any], ['skill', ['Freeze']]);
  const sup = R.parseFilter(byName('Supply Drop (Bronze)').Desc);
  eq('"Supply Drop": ba tên thẻ + bậc Bronze', [sup.names.length, sup.tiers], [3, ['Bronze']]);
  eq('"Sells Small and Medium items. Buys your Large ...": chỉ Small, Medium', R.parseFilter(byName('Quixel').Desc).sizes, ['Small', 'Medium']);
  // ngày 1 không có thẻ ngoài bậc Bronze ở thương nhân thường
  check('ngày 1: Jay Jay chỉ bày bậc Bronze', (() => { const x = baseRun(); return R.deal(x, R.ENCOUNTERS.merchant.filter(byName('Jay Jay')), 30, {}).every(c => c.tier === 'Bronze'); })());
}

// ---------- bot tham lam ----------
function botStep(run) {
  const L = R.legal(run).filter(c => c.t !== 'move');
  const ph = run.phase;
  const has = t => L.filter(c => c.t === t);
  if (ph.kind === 'merchant') {
    const buys = has('buy');
    if (buys.length) return buys.reduce((a, b) => (ph.stock[b.i].price > ph.stock[a.i].price ? b : a));
    return { t: 'leave' };
  }
  if (ph.kind === 'choose') {
    if (run.hour === R.TUNING.PVE_HOUR) return { t: 'pick', i: 0 };
    const mi = ph.options.findIndex(o => o.type === 'merchant');
    if (run.gold >= 4 && mi >= 0) return { t: 'pick', i: mi };
    const ei = ph.options.findIndex(o => o.type !== 'merchant');
    return { t: 'pick', i: ei >= 0 ? ei : 0 };
  }
  for (const t of ['choose', 'fight', 'next', 'pickHero', 'leave']) { const x = has(t); if (x.length) return x[0]; }
  // hết chỗ: bán thẻ rẻ nhất trong kho để có chỗ nhận loot
  const s = has('sell'); if (s.length) return s[0];
  return null;
}
function playBot(hero, seed, record) {
  let run = R.newRun({ hero, seed }), n = 0;
  const cmds = [];
  while (run.phase.kind !== 'end') {
    if (++n > 4000) throw new Error('bot stalled (4000 commands) in phase ' + run.phase.kind);
    const cmd = botStep(run);
    if (!cmd) throw new Error('bot found no legal command in phase ' + run.phase.kind);
    const r = R.apply(run, cmd);
    if (!r.ok) throw new Error('legal command rejected: ' + JSON.stringify(cmd) + ' in ' + run.phase.kind + ': ' + r.events[0].reason);
    if (record) cmds.push(cmd);
    run = r.run;
  }
  return { run, cmds, n };
}

function determinism() {
  console.log('\n# Tất định');
  const a = playBot('Pygmalien', 1234, true);
  let run = R.newRun({ hero: 'Pygmalien', seed: 1234 });
  const frozen = R.serialize(run);
  a.cmds.forEach(c => { run = R.apply(run, c).run; });
  eq('cùng seed + cùng chuỗi lệnh → run giống hệt (serialize)', R.serialize(run) === R.serialize(a.run), true);
  check('chuỗi lệnh đủ dài (' + a.cmds.length + ' lệnh, hết run: ' + a.run.phase.reason + ')', a.cmds.length > 50);
  const b = playBot('Pygmalien', 1235, false);
  check('seed khác → run khác', R.serialize(b.run) !== R.serialize(a.run));
  const r0 = R.newRun({ hero: 'Pygmalien', seed: 1234 });
  R.apply(r0, { t: 'choose', i: 2 });
  eq('apply không sửa run đầu vào', R.serialize(r0), frozen);
  eq('deserialize(serialize(run)) giữ nguyên', R.serialize(R.deserialize(R.serialize(a.run))), R.serialize(a.run));
}

function sweep() {
  console.log('\n# Quét bot: ' + SWEEP + ' run mỗi hero');
  BZ.resetStats();
  const t0 = Date.now();
  R.HEROES_PLAYABLE.forEach(hero => {
    const st = { wins: {}, reason: {}, day: {}, gold: 0, level: 0, pve: [0, 0], pvp: [0, 0], cmds: 0, errors: 0 };
    for (let i = 0; i < SWEEP; i++) {
      let res;
      try { res = playBot(hero, 1000 + i, false); } catch (e) { st.errors++; if (st.errors <= 3) console.log('    lỗi seed ' + (1000 + i) + ': ' + e.message); continue; }
      const run = res.run;
      st.wins[run.wins] = (st.wins[run.wins] || 0) + 1;
      st.reason[run.phase.reason] = (st.reason[run.phase.reason] || 0) + 1;
      st.day[run.day] = (st.day[run.day] || 0) + 1;
      st.gold += run.gold; st.level += run.level; st.cmds += res.n;
      run.log.forEach(l => { if (l.t === 'fight') { const k = l.type === 'PVE' ? 'pve' : 'pvp'; st[k][l.won ? 0 : 1]++; } });
    }
    const ok = SWEEP - st.errors;
    check(hero + ': ' + SWEEP + ' run xong không lỗi', st.errors === 0, st.errors + ' lỗi');
    console.log('    hết run: ' + JSON.stringify(st.reason) + '  | ngày cuối: ' + JSON.stringify(st.day));
    console.log('    số trận PvP thắng: ' + JSON.stringify(st.wins));
    console.log('    PvE thắng/thua ' + st.pve.join('/') + ', PvP thắng/thua ' + st.pvp.join('/') +
      ' | vàng cuối TB ' + (st.gold / ok).toFixed(1) + ', cấp TB ' + (st.level / ok).toFixed(1) + ', lệnh/run ' + (st.cmds / ok).toFixed(0));
  });
  console.log('    ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s; sim errors ' + BZ.errors.length + ', unknownTypes ' + JSON.stringify(BZ.unknownTypes));
  console.log('    ngoài trận chưa làm (BZRun.ooc.approx): ' + JSON.stringify(R.ooc.approx));
  check('sim không ném lỗi trong quét', BZ.errors.length === 0, BZ.errors.slice(0, 3));
}

if (!ONLY || ONLY === 'rules') rules();
if (!ONLY || ONLY === 'det') determinism();
if (!ONLY || ONLY === 'sweep') sweep();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
