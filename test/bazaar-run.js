/*
 * Chợ Phiên (games/bazaar) — kiểm vòng chơi js/run/* (reducer thuần, tất định) bằng Node, không cần trình duyệt.
 * Chạy:  node test/bazaar-run.js              (mọi phần; quét bot 200 run mỗi hero chơi được)
 *        SWEEP=20 node test/bazaar-run.js     bớt số run quét;  ONLY=rules|pha4|det|sweep  chỉ chạy một phần
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
// data/heroes.js (khởi đầu + bể lên cấp theo hero, nhánh dữ liệu) nạp nếu có; data/ghosts.js KHÔNG nạp: quét bot dùng bóng quái,
// phần bóng từ bộ dữ liệu kiểm bằng BZ_GHOSTS nhỏ viết tay bên dưới.
try { require(path.join(ROOT, 'games/bazaar/data/heroes.js')); } catch (e) { /* chưa có: khởi đầu chung */ }
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
  check('hero không chơi được bị từ chối', !R.apply(R.newRun({ seed: 1 }), { t: 'pickHero', hero: 'TheDragons' }).ok);
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
  r = R.apply(run, { t: 'move', uid: m1.uid, section: 'hand', socket: 4 });
  eq('move Medium 3 → 4 đè Small ở 5: Small bị đẩy sang 6', [r.ok, r.run.board.hand.map(c => [c.id, c.socket]), r.events.filter(e => e.type === 'move').map(e => [e.uid, e.to.socket, e.pushed])],
    [true, [['tMed', 4], ['tSmall', 6]], [[m1.uid, 4, false], [sm.uid, 6, true]]]);
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
  r = pvp(true, 7, 20, 9);
  eq('trận thắng thứ 10: rương Vàng trước, chọn xong thì hết run "victory"', [r.run.phase.kind, r.run.phase.tier, R.apply(r.run, { t: 'leave' }).run.phase.kind, R.apply(r.run, { t: 'leave' }).run.phase.reason],
    ['chest', 'Gold', 'end', 'victory']);
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

// ---------- Pha 4: đổi chỗ, xếp lại trước trận, bàn tốt nhất, rương, quest, trigger ngoài trận, khởi đầu theo hero, bóng dữ liệu ----------
const byCard = n => Object.values(globalThis.BZ_CARDS).find(t => t.InternalName === n);
const byEvent = n => Object.values(globalThis.BZ_ENCOUNTERS.events).find(e => e.InternalName === n);
const titleOf = id => R.title(R.tpl(id));
// thẻ quest tổng hợp: "Dùng 2 vật phẩm khác" (OnItemUsed, SelfHand trừ chính nó) → +50 sát thương
BZ.extraCards.tQuest = tpl('tQuest', 'Small', { Quests: [{ Prerequisites: [], Entries: [{ AttributeType: 'Quest_1',
  Trigger: { $type: 'TTriggerOnItemUsed', Subject: { $type: 'TTargetCardSection', TargetSection: 'SelfHand', ExcludeSelf: true } },
  Target: 2, Update: { Value: { $type: 'TFixedValue', Value: 1 } }, Localization: { Tooltips: [{ Content: { Text: 'Use 2 items' }, TooltipType: 'Passive' }] },
  Reward: { Abilities: {}, Tags: [], HiddenTags: [], Auras: { q1: { Id: 'q1', ActiveIn: 'HandAndStash', WorksIn: 'Anywhere', Action: { $type: 'TAuraActionCardModifyAttribute',
    AttributeType: 'DamageAmount', Operation: 'Add', Value: { $type: 'TFixedValue', Value: 50 }, Target: { $type: 'TTargetCardSelf' } } } },
  Localization: { Tooltips: [{ Content: { Text: 'This has +{aura.q1} Damage' }, TooltipType: 'Passive' }] } } }] }] });
// "Khi thương nhân bày hàng: nâng bậc 1 món ngẫu nhiên" (mẫu Lucky Clover ability 2, bỏ tiền đề)
BZ.extraCards.tUpSel = tpl('tUpSel', 'Small', { Abilities: { 0: { Id: '0', ActiveIn: 'HandAndStash', WorksIn: 'Anywhere', Priority: 'Medium',
  Trigger: { $type: 'TTriggerOnEncounterCardsDealt' },
  Action: { $type: 'TActionCardUpgrade', TargetCount: { $type: 'TFixedValue', Value: 1 }, Target: { $type: 'TTargetCardRandom', ExcludeSelf: false, TargetSection: 'SelectionSet' } } } } });
BZ.extraCards.tUpSel.Tiers.Bronze.AbilityIds = ['0'];

function pha4() {
  console.log('\n# Pha 4');
  let run, r, c;
  // ---- swap ----
  run = baseRun(); run.phase = merchantPhase([]);
  const a = inst(run, 'tMed', 'hand', 3), b = inst(run, 'tSmall', 'hand', 5);
  r = R.apply(run, { t: 'swap', a: a.uid, b: b.uid });
  eq('swap Medium@3 ↔ Small@5: Small về 3, Medium sang 5', [r.ok, r.run.board.hand.map(x => [x.id, x.socket]), types(r)], [true, [['tSmall', 3], ['tMed', 5]], ['move', 'move', 'swap']]);
  const st = inst(run, 'tSmall', 'stash', 0, 'Silver');
  r = R.apply(run, { t: 'swap', a: st.uid, b: a.uid });
  eq('swap kho Small@0 ↔ tay Medium@3 (không cần ô trống)', [r.ok, r.run.board.hand.map(x => [x.id, x.tier, x.socket]), r.run.board.stash.map(x => [x.id, x.socket])],
    [true, [['tSmall', 'Silver', 3], ['tSmall', 'Bronze', 5]], [['tMed', 0]]]);
  run = baseRun(); run.phase = merchantPhase([]);
  inst(run, 'tLarge', 'hand', 3); const s6 = inst(run, 'tSmall', 'hand', 6); const big = inst(run, 'tLarge', 'stash', 0);
  r = R.apply(run, { t: 'swap', a: big.uid, b: s6.uid });
  eq('swap Large kho ↔ Small@6 (6-8 khoá, 4-6 chồng Large khác) bị từ chối', [r.ok, /sizes do not fit/.test(r.events[0].reason)], [false, true]);
  const sk = inst(run, 'tSkill', 'skills', 0);
  eq('swap kỹ năng bị từ chối', R.apply(run, { t: 'swap', a: sk.uid, b: s6.uid }).ok, false);
  // tay đầy (3..6 = hai Medium): kéo Small từ kho vào ô 3 → không đẩy được → đổi chỗ với Medium@3
  run = baseRun(); run.phase = merchantPhase([]);
  const m3 = inst(run, 'tMed', 'hand', 3); inst(run, 'tMed', 'hand', 5); const k0 = inst(run, 'tSmall', 'stash', 0);
  r = R.apply(run, { t: 'move', uid: k0.uid, section: 'hand', socket: 3 });
  eq('move vào tay đầy: đổi chỗ với thẻ chắn (Medium@3 về kho 0)', [r.ok, r.run.board.hand.map(x => [x.id, x.socket]), r.run.board.stash.map(x => [x.uid, x.socket])],
    [true, [['tSmall', 3], ['tMed', 5]], [[m3.uid, 0]]]);

  // ---- xếp lại / bán ở pha fight ----
  run = baseRun(); run.hour = 2;
  const f1 = inst(run, 'tSmall', 'hand', 3), f2 = inst(run, 'tMed', 'hand', 4);
  run.phase = { kind: 'fight', combatType: 'PVE', seed: 7, after: 'endHour', opponent: { kind: 'monster', name: 'dummy', monsterId: null, combatId: null, rewards: { gold: 1, xp: 1 }, board: { name: 'dummy', healthMax: 1000, cards: [] } } };
  const lg = R.legal(run).map(x => x.t);
  eq('pha fight: lệnh hợp lệ gồm fight + sell/move/swap', ['fight', 'sell', 'move', 'swap'].map(t => lg.indexOf(t) >= 0), [true, true, true, true]);
  r = R.apply(run, { t: 'swap', a: f1.uid, b: f2.uid });
  eq('pha fight: đổi chỗ trước trận, bàn vào trận theo chỗ mới', [r.ok, r.run.phase.kind, R.fightBoards(r.run)[0].cards.map(x => [x.uid, x.socket])], [true, 'fight', [[f2.uid, 3], [f1.uid, 5]]]);
  r = R.apply(r.run, { t: 'sell', uid: f1.uid });
  eq('pha fight: bán Small Bronze +1 vàng, vẫn ở pha fight', [r.ok, r.run.gold, r.run.phase.kind], [true, 9, 'fight']);

  // ---- run.best + rương mốc thắng ----
  const pvpAt = (won, day, wins) => {
    const x = baseRun(); x.day = day; x.hour = 5; x.wins = wins; inst(x, 'tSmall', 'hand', 4, 'Gold');
    x.phase = { kind: 'fightResult', combatType: 'PVP', winner: won ? 'player' : 'opponent', won, endMs: 1, seed: 1, rewards: {}, opponent: { kind: 'ghost', name: 'g' }, after: 'endHour' };
    return R.apply(x, { t: 'next' });
  };
  r = pvpAt(true, 4, 3);
  const lootGold = byEvent('Bronze Loot (Level Up)').Abilities[0].Action.Value.Value;
  eq('thắng PvP thứ 4: run.best chụp bàn (4 thắng, cấp 1, Small Gold ô 4)', [r.run.best.wins, r.run.best.level, r.run.best.day, r.run.best.board.hand.map(x => [x.id, x.tier, x.socket])], [4, 1, 4, [['tSmall', 'Gold', 4]]]);
  eq('thắng PvP thứ 4: rương Đồng, 3 thẻ Loot bậc Bronze, +' + lootGold + ' vàng (Bronze Loot ability 0)',
    [r.run.phase.kind, r.run.phase.tier, r.run.phase.picks.length, r.run.phase.picks.every(p => p.card.tier === 'Bronze' && R.tpl(p.card.id).Tags.indexOf('Loot') >= 0), r.run.gold, r.run.phase.gold, types(r).filter(t => /win|best|chest|gold/.test(t))],
    ['chest', 'Bronze', 3, true, 8 + lootGold, lootGold, ['win', 'best', 'chest', 'gold']]);
  const ch = R.apply(r.run, { t: 'choose', i: 0 });
  eq('rương: chọn 1 thẻ → vào tay, hết giờ PvP sang ngày 5 (+5 thu nhập)', [ch.ok, ch.run.board.hand.length, ch.run.phase.kind, ch.run.day, ch.run.hour, ch.run.gold], [true, 2, 'choose', 5, 0, 8 + lootGold + 5]);
  eq('thắng PvP thứ 7: rương Bạc; thứ 5: không rương', [pvpAt(true, 6, 6).run.phase.tier, pvpAt(true, 5, 4).run.phase.kind], ['Silver', 'choose']);
  eq('thua PvP: run.best không đổi (chưa có)', pvpAt(false, 4, 3).run.best || null, null);
  const xb = baseRun(); R.end({ run: xb, events: [] }, 'prestige');
  eq('hết run chưa thắng trận nào: run.best = bàn lúc hết run', [xb.best.wins, xb.best.level], [0, 1]);

  // ---- quest: Dog "Sell 15 Food or Toys" → +200 Damage (cards.json Dog Quests[0]) ----
  run = baseRun('Pygmalien'); run.phase = merchantPhase([]);
  const dog = inst(run, byCard('Dog').Id, 'hand', 3); dog.qp = { '0.0': 14 };
  const choco = inst(run, byCard('Chocolate Bar').Id, 'hand', 5);
  const dmg0 = BZ.attrs(R.simCard(dog)).DamageAmount;
  r = R.apply(run, { t: 'sell', uid: choco.uid });
  const dog2 = R.findCard(r.run, dog.uid);
  eq('Dog: bán Chocolate Bar → quest 15/15 xong, nhóm 2-3 lên 1/30, 1/45', r.events.filter(e => /^quest/.test(e.type)).map(e => [e.type, e.key, e.progress || 0, e.goal || 0]),
    [['quest', '0.0', 15, 15], ['questDone', '0.0', 0, 0], ['quest', '1.0', 1, 30], ['quest', '2.0', 1, 45]]);
  eq('Dog xong quest: mẫu dẫn xuất, sát thương ' + dmg0 + ' → ' + (dmg0 + 200), [dog2.qd, R.simCard(dog2).id === dog.id + '~q0.0', R.baseId(R.simCard(dog2).id) === dog.id, BZ.attrs(R.simCard(dog2)).DamageAmount],
    [['0.0'], true, true, dmg0 + 200]);
  const qs0 = R.quests.status(dog2)[0];
  eq('BZRun.quests.status(Dog)[0]', [qs0.progress, qs0.goal, qs0.done, qs0.text], [15, 15, true, 'Sell 15 Food or Toys']);
  check('chữ tooltip Dog có dòng thưởng "+200 Damage"', BZ.cardText(R.simCard(dog2)).some(l => /\+200 Damage/.test(l.text)), BZ.cardText(R.simCard(dog2)).map(l => l.text));
  delete BZ.extraCards[dog.id + '~q0.0'];
  const rl = R.deserialize(R.serialize(r.run));
  check('deserialize đăng ký lại mẫu dẫn xuất', !!BZ.extraCards[dog.id + '~q0.0'] && R.findCard(rl, dog.uid).qd[0] === '0.0');
  // Safe: "Find a Cache of Riches" (OnEncounterSelected) → "...and get a Bag of Jewels" khi bán
  run = baseRun('Pygmalien');
  const safe = inst(run, byCard('Safe').Id, 'hand', 3);
  run.phase = { kind: 'choose', options: [R.encounterRef('event', byEvent('Cache of Riches (Day 1 to 2)'))] };
  r = R.apply(run, { t: 'pick', i: 0 });
  eq('Safe: chọn Cache of Riches → quest nhóm 1 xong', [r.ok, R.findCard(r.run, safe.uid).qd], [true, ['1.0']]);
  const sv = r.run; sv.phase = merchantPhase([]);
  r = R.apply(sv, { t: 'sell', uid: safe.uid });
  eq('Safe đã xong quest: bán → 3 Spare Change (gốc) + 1 Bag of Jewels (thưởng)', r.events.filter(e => e.type === 'gain').map(e => titleOf(e.id)), ['Spare Change', 'Spare Change', 'Spare Change', 'Bag of Jewels']);
  // quest trong trận: đếm sự kiện "fire" của trận
  run = baseRun(); run.hour = 2;
  const q = inst(run, 'tQuest', 'hand', 3), o1 = inst(run, 'tSmall', 'hand', 4);
  const qctx = { run: R.clone(run), events: [] };
  R.quests.fromFight(qctx, [R.playerBoard(run), { name: 'x', healthMax: 10, cards: [] }], { frames: [{ ev: [{ type: 'fire', src: o1.uid }, { type: 'fire', src: q.uid }] }, { ev: [{ type: 'fire', src: o1.uid }] }] });
  const q2 = R.findCard(qctx.run, q.uid);
  eq('quest OnItemUsed (trừ chính nó) đếm từ sự kiện trận: 2/2 xong, +50 sát thương', [qctx.events.filter(e => /^quest/.test(e.type)).map(e => e.type + ':' + (e.progress || '')), q2.qd, BZ.attrs(R.simCard(q2)).DamageAmount],
    [['quest:1', 'quest:2', 'questDone:'], ['0.0'], 50]);

  // ---- trigger ngoài trận: SelectionSet, vào / rời thương nhân, giá bán cộng thêm ----
  const jay = byEvent('Jay Jay');
  run = baseRun(); run.phase = merchantPhase([{ card: { id: 'tSmall', tier: 'Bronze', ench: null }, price: 4 }, { card: { id: 'tMed', tier: 'Bronze', ench: null }, price: 8 }]);
  const gt = inst(run, byCard('Galactic Translator').Id, 'hand', 4, 'Diamond'); gt.mods = { Custom_0: 1 };
  c = { run: R.clone(run), events: [] }; R.ooc.fire(c, 'TTriggerOnEncounterCardsDealt', { enc: jay });
  eq('Galactic Translator: thương nhân bày hàng → mỗi món −1 vàng (4, 8 → 3, 7)', c.run.phase.stock.map(s => s.price), [3, 7]);
  r = R.apply(c.run, { t: 'leave' });
  eq('rời thương nhân (OnEncounterExited): Galactic Translator Custom_0 về 0', R.findCard(r.run, gt.uid).mods.Custom_0, 0);
  run = baseRun(); run.phase = merchantPhase([{ card: { id: 'tSmall', tier: 'Bronze', ench: null }, price: 4 }, { card: { id: 'tMed', tier: 'Bronze', ench: null }, price: 8 }]);
  const cp = inst(run, byCard('Coupon').Id, 'hand', 4, 'Gold'); cp.mods = { Custom_0: 1 };
  const cpGold = R.sellPrice(run, cp.uid);
  r = R.apply(run, { t: 'sell', uid: cp.uid });
  eq('Coupon: bán ở thương nhân → hàng giảm 50% (4, 8 → 2, 4), +' + cpGold + ' vàng', [r.ok, r.run.phase.stock.map(s => s.price), r.run.gold], [true, [2, 4], 8 + cpGold]);
  run = baseRun(); run.phase = merchantPhase([{ card: { id: 'tSmall', tier: 'Bronze', ench: null }, price: 2 }]);
  inst(run, 'tUpSel', 'hand', 4);
  c = { run: R.clone(run), events: [] }; R.ooc.fire(c, 'TTriggerOnEncounterCardsDealt', { enc: jay });
  eq('SelectionSet: nâng bậc hàng bày Small Bronze 2 vàng → Silver 4 vàng', [c.run.phase.stock[0].card.tier, c.run.phase.stock[0].price, c.events.filter(e => e.type === 'stock').map(e => e.why)], ['Silver', 4, ['upgrade']]);
  run = baseRun(); run.phase = merchantPhase([]); run.phase.merchantId = byEvent('Quixel').Id;
  const lq = inst(run, 'tLarge', 'stash', 0), sq = inst(run, 'tSmall', 'stash', 3);
  eq('Quixel "Buys your Large items at +3": Large Bronze 3 → 6, Small giữ 1', [R.sellPrice(run, lq.uid), R.sellPrice(run, sq.uid)], [6, 1]);
  run.phase.merchantId = byEvent('Barkun').Id;
  eq('Barkun "+1 Small": Small Bronze 1 → 2', R.sellPrice(run, sq.uid), 2);
  run.phase = { kind: 'choose', options: [] };
  eq('ngoài thương nhân: Large Bronze bán 3', R.sellPrice(run, lq.uid), 3);
  // Spawn của vật phẩm: "get a Premium Piggle" → một Premium <màu> Piggles; Book of Secrets → kỹ năng bậc của sách
  run = baseRun('Pygmalien'); run.gold = 20;
  run.phase = merchantPhase([{ card: { id: byCard('Premium Piggles').Id, tier: 'Bronze', ench: null }, price: 2 }]);
  r = R.apply(run, { t: 'buy', i: 0 });
  const pg = r.events.filter(e => e.type === 'gain');
  eq('mua Premium Piggles: thêm 1 Premium <màu> Piggles bậc Bronze', [pg.length, /^Premium (Green|Red|Orange|Yellow) Piggles$/.test(titleOf(pg[1].id)), pg[1].tier, pg[1].why], [2, true, 'Bronze', 'spawn']);
  run = baseRun('Pygmalien'); inst(run, byCard('Book of Secrets').Id, 'hand', 3, 'Silver');
  c = { run: R.clone(run), events: [] }; R.ooc.fire(c, 'TTriggerOnDayStarted', {});
  const bk = c.events.filter(e => e.type === 'gain');
  eq('Book of Secrets Silver đầu ngày: 1 kỹ năng bậc Silver vào ô kỹ năng', [bk.length, !!bk[0] && R.isSkill(R.tpl(bk[0].id)), bk[0] && bk[0].tier, bk[0] && bk[0].section], [1, true, 'Silver', 'skills']);

  // ---- bóng PvP từ bộ dữ liệu (BZ_GHOSTS) ----
  const had = globalThis.BZ_GHOSTS;
  globalThis.BZ_GHOSTS = { v: 1, byDay: {
    '2': [{ name: 'Ana', hero: 'Vanessa', level: 3, day: 2, wins: 1, healthMax: 999, cards: [{ id: 'tSmall', tier: 'Silver', ench: null, socket: 3, size: 1, section: 'hand' }] },
      { name: 'Bo', hero: 'Dooley', level: 3, day: 2, wins: 2, healthMax: 999, cards: [{ id: 'tMed', tier: 'Bronze', ench: null, socket: 4, size: 2, section: 'hand' }] }],
    '5': [{ name: 'Cy', hero: 'Vanessa', level: 6, day: 5, wins: 3, healthMax: 999, cards: [{ id: 'tLarge', tier: 'Gold', ench: null, socket: 2, size: 3, section: 'hand', uid: 'p7' }] }] } };
  run = baseRun('Vanessa'); run.day = 3;
  const g3 = R.ENCOUNTERS.combat.ghost(run);
  eq('bóng ngày 3 → danh sách ngày 2, ưu tiên hero khác Vanessa (Bo), máu GHOST_HP_BY_DAY ngày 3 = 450',
    [g3.source, g3.name, g3.hero, g3.board.healthMax, g3.board.cards.map(x => [x.uid, x.id, x.tier, x.socket])], ['dataset', 'Bo', 'Dooley', 450, [['g-0', 'tMed', 'Bronze', 4]]]);
  run.day = 6;
  const g6 = R.ENCOUNTERS.combat.ghost(run);
  eq('bóng ngày 6 → ngày 5 chỉ có Vanessa: vẫn dùng (Cy), uid đổi thành g-0, máu 1500', [g6.name, g6.board.healthMax, g6.board.cards[0].uid], ['Cy', 1500, 'g-0']);
  run.day = 1;
  const g1 = R.ENCOUNTERS.combat.ghost(run);
  eq('bóng ngày 1 (không có ngày ≤ 1 trong bộ dữ liệu) → bóng quái', [g1.source || 'monster', /^Ghost of /.test(g1.name), g1.board.healthMax], ['monster', true, 350]);
  run.day = 3; run.hour = 5; c = { run: R.clone(run), events: [] }; R.ENCOUNTERS.combat.enterPvp(c);
  eq('giờ PvP dùng bóng bộ dữ liệu', [c.run.phase.kind, c.run.phase.opponent.name], ['fight', 'Bo']);
  if (had === undefined) delete globalThis.BZ_GHOSTS; else globalThis.BZ_GHOSTS = had;

  // ---- khởi đầu theo hero (data/heroes.js) ----
  if (globalThis.BZ_HEROES) {
    const H = globalThis.BZ_HEROES;
    eq('hero chơi được = BZ_HEROES.heroes[*].playable', R.HEROES_PLAYABLE, H.order.filter(h => H.heroes[h].playable));
    const kar = R.newRun({ hero: 'Karnok', seed: 3 }), ks = H.heroes.Karnok.start;
    eq('Karnok: vàng/thu nhập gốc, có sẵn Karnok\'s Rage, run.effects = playerEffects', [kar.gold, kar.income, kar.board.skills.map(x => titleOf(x.id)), kar.effects],
      [ks.baseGold, ks.baseIncome, ["Karnok's Rage"], ks.playerEffects]);
    const van = R.newRun({ hero: 'Vanessa', seed: 3 }), sc = van.phase.choices.find(x => x.key === 'skill');
    const step = globalThis.BZ_ENCOUNTERS.steps[sc.stepId];
    check('Vanessa: lựa chọn kỹ năng = một bước "(Start Skill)" của hero', H.heroes.Vanessa.start.skillSteps.indexOf(sc.stepId) >= 0 && /Choose a free/.test(sc.desc), sc);
    r = R.apply(van, { t: 'choose', i: van.phase.choices.indexOf(sc) });
    const tag = R.parseFilter(step.Desc).any[0], lim = step.Abilities[0].Action.SpawnContext.Limit.Value;
    eq('Vanessa chọn "' + step.InternalName + '": bày ' + lim + ' kỹ năng có tag ' + tag,
      [r.run.phase.kind, r.run.phase.picks.length, r.run.phase.picks.every(p => { const t = R.tpl(p.card.id); return R.isSkill(t) && t.Tags.concat(t.HiddenTags).indexOf(tag) >= 0; })],
      ['loot', lim, true]);
    r = R.apply(r.run, { t: 'choose', i: 0 });
    eq('chọn kỹ năng mở màn → vào giờ 0', [r.ok, r.run.board.skills.length, r.run.phase.kind, r.run.hour], [true, 1, 'choose', 0]);
  }
  // ---- loại sự kiện mới của encounters.js: fight / chain / Options / Then / Parents / starts ----
  const EV = globalThis.BZ_ENCOUNTERS, stepN = n => Object.values(EV.steps).find(s => s.InternalName === n);
  const kids = Object.values(EV.events).filter(e => e.Parents && e.Parents.length).map(e => e.Id);
  let seenKid = false;
  for (let sd = 1; sd <= 40 && kids.length; sd++) { const x = baseRun(); x.seed = sd; x.rng = sd; for (let d = 1; d <= 10; d++) { x.day = d; R.hourOptions(x).forEach(o => { if (kids.indexOf(o.id) >= 0) seenKid = true; }); } }
  eq('sự kiện con (có Parents, vd "Suprise Mushroom - Stronger") không vào bể giờ tự do (40 seed × 10 ngày)', [kids.length > 0, seenKid], [true, false]);
  const duel = byEvent('Deadly Duel (Day 5)');
  if (duel) {
    run = baseRun(); run.day = 5; run.phase = { kind: 'choose', options: [R.encounterRef('event', duel)] };
    r = R.apply(run, { t: 'pick', i: 0 });
    eq('"Deadly Duel (Day 5)" (fight, FightTier ' + duel.FightTier + '): vào trận với quái bậc đó', [r.ok, r.run.phase.kind, globalThis.BZ_ENCOUNTERS.combats[r.run.phase.opponent.combatId].StartingTier], [true, 'fight', duel.FightTier]);
  }
  const wish = stepN('Wish for Wealth (1st Wish)');
  if (wish) {
    run = baseRun(); run.phase = { kind: 'event', eventId: null, choices: [{ kind: 'step', id: wish.Id }], canExit: true, after: 'endHour' };
    r = R.apply(run, { t: 'choose', i: 0 });
    eq('Then: "Wish for Wealth (1st Wish)" +' + wish.Abilities[0].Action.Value.Value + ' vàng rồi bày 3 điều ước kế (thay cho Deal)',
      [r.run.gold, r.run.phase.kind, r.run.phase.choices.map(x => x.id)], [8 + wish.Abilities[0].Action.Value.Value, 'event', wish.Then.map(x => x.id)]);
  }
  const gum = stepN('Get a Gumball (10)');
  if (gum) {
    run = baseRun(); run.phase = { kind: 'event', eventId: null, choices: [{ kind: 'step', id: gum.Id }], canExit: true, after: 'endHour' };
    r = R.apply(run, { t: 'choose', i: 0 });
    eq('"Get a Gumball (10)": 1 viên Gumball màu, bày tiếp (9)', [r.events.filter(e => e.type === 'gain').map(e => /^(Red|Blue|Yellow|Green) Gumball$/.test(titleOf(e.id))), r.run.phase.choices.map(x => stepN.length && EV.steps[x.id].InternalName)],
      [[true], ['Get a Gumball (9)', 'Get 5 Gumballs (9)']]);
  }
  if (EV.starts && globalThis.BZ_HEROES) {
    const vs = R.newRun({ hero: 'Vanessa', seed: 1 });
    eq('màn mở đầu mang tên thẻ "(Start Run)" của hero', [vs.phase.name, EV.starts[vs.phase.startId].Role], [EV.starts[vs.phase.startId].Title, 'run']);
  }
  eq('BZRun.ooc.approx rỗng sau phần Pha 4', R.ooc.approx, {});
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
    console.log('    [' + hero + ']');
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
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4') pha4();
if (!ONLY || ONLY === 'det') determinism();
if (!ONLY || ONLY === 'sweep') sweep();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
