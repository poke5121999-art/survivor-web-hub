/*
 * Chợ Phiên (games/bazaar) — kiểm vòng chơi js/run/* (reducer thuần, tất định) bằng Node, không cần trình duyệt.
 * Chạy:  node test/bazaar-run.js              (mọi phần; quét bot 200 run mỗi hero chơi được)
 *        SWEEP=20 node test/bazaar-run.js     bớt số run quét;  ONLY=rules|pha4|fix9|fix9b|fix9c|fix9d|det|sweep  chỉ chạy một phần
 *
 * Số kỳ vọng tính tay từ dữ liệu:
 * - giá: game_modes.json StandardPrices (Small Bronze 2/1, Medium Silver 8/4, Large Gold 24/12, Small Legendary 24/12,
 *   kỹ năng Gold 20/10); bán = SellPrice của thẻ (bảng, không ghi đè).
 * - run mới: 8 vàng + 5 thu nhập [WIKI], 20 uy tín, 300 máu [clip PSP75k4R4Pk?t=123], ô tay mở 3,4,5,6.
 * - lên cấp ở 8 XP: máu 300 -> 350 (bảng TUNING.HP_BY_LEVEL: Version 2.5.0 + clip wUzq6Q4u9Jc, WIKI2 R2), mở thêm ô 2 và 7 (BazaarDeckTools.cs:1170-1230).
 * - thua PvP ngày 4: uy tín 20 → 16.
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
['cards', 'monsters', 'mode', 'encounters', 'shops'].forEach(f => require(path.join(ROOT, 'games/bazaar/data/' + f + '.js')));
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
  eq('máu theo cấp (WIKI2 R2: Version 2.5.0 "starting health +50" + clip wUzq6Q4u9Jc C2 350 ... C10 2550; sau C10 nối +50/cấp): cấp 1,2,3,5,7,9,10,11,12',
    [1, 2, 3, 5, 7, 9, 10, 11, 12].map(R.hpAtLevel), [300, 350, 450, 800, 1350, 2100, 2550, 3050, 3600]);
  eq('run mới: pha mở màn 3 lựa chọn, không thoát', [run.phase.kind, run.phase.choices.map(c => c.key), run.phase.canExit], ['event', ['income', 'item', 'skill'], false]);
  eq('run mới: ô tay mở 3..6', R.unlockedSockets(1).map((b, i) => b ? i : -1).filter(i => i >= 0), [3, 4, 5, 6]);
  eq('heroSelect không truyền hero', R.newRun({ seed: 1 }).phase.kind, 'heroSelect');
  check('hero không chơi được bị từ chối', !R.apply(R.newRun({ seed: 1 }), { t: 'pickHero', hero: 'TheDragons' }).ok);
  const r0 = R.apply(run, { t: 'choose', i: 0 });
  eq('mở màn Thu nhập: 8+12 vàng, 5+2 thu nhập, sang giờ 0 chọn gặp gỡ', [r0.run.gold, r0.run.income, r0.run.phase.kind, r0.run.phase.options.length], [20, 7, 'choose', 3]);
  {
    const seen = new Set();
    for (let sd = 1; sd <= 80; sd++) for (let d = 1; d <= 10; d++) {
      const x = R.newRun({ hero: 'Vanessa', seed: sd }); x.day = d;
      for (let h = 0; h < 4; h++) R.hourOptions(x).forEach(o => seen.add(o.name));
    }
    eq('giờ tự do không bày gặp gỡ không có art trong game (Claw Game, Big Bad Wolf)', ['Claw Game', 'Big Bad Wolf'].filter(n => seen.has(n)), []);
    const mush = Object.values(globalThis.BZ_ENCOUNTERS.events).find(e => e.InternalName === 'A Strange Mushroom'), shown = new Set();
    for (let sd = 1; sd <= 60; sd++) {
      const x = R.newRun({ hero: 'Vanessa', seed: sd }); x.day = 2;
      x.phase = { kind: 'choose', options: [R.encounterRef('event', mush)] };
      const rr = R.apply(x, { t: 'pick', i: 0 });
      (rr.run.phase.choices || []).forEach(c => shown.add(c.name));
    }
    eq('A Strange Mushroom chỉ bày lựa chọn bản live còn (không "Suprise Mushroom - Stronger", "Keep it for Luck"); luôn có Sell It và Trade It',
      [shown.has('Suprise Mushroom - Stronger'), shown.has('Keep it for Luck'), shown.has('Sell It'), shown.has('Trade It for Something')], [false, false, true, true]);
  }
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
  r = R.apply(r.run, { t: 'buy', i: 0 });
  eq('mua kỹ năng trùng id + bậc: nhập lên một bậc (RUN-07, SkillCard.CanFuseWith)', [r.ok, r.run.board.skills.length, r.run.board.skills[0].tier], [true, 1, 'Silver']);

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
  eq('8 XP: cấp 2, máu 300+50 = 350 (WIKI2 R2, clip PSP75k4R4Pk cấp 2 = 350), ô mở 2..7', [r.run.level, r.run.healthMax, R.unlockedSockets(r.run.level).map((b, i) => b ? i : -1).filter(i => i >= 0)],
    [2, 350, [2, 3, 4, 5, 6, 7]]);
  eq('8 XP: sự kiện levelUp, pha lên cấp chen vào đầu giờ 1', [types(r).indexOf('levelUp') >= 0, r.run.phase.kind, r.run.hour, r.run.phase.choices.length > 0],
    [true, 'levelUp', 1, true]);
  eq('ô mở cấp 3 / 4', [R.unlockedSockets(3).filter(Boolean).length, R.unlockedSockets(4).filter(Boolean).length, R.unlockedSockets(9).filter(Boolean).length], [8, 10, 10]);
  run.xp = 15; run.level = 1;
  r = R.apply(run, { t: 'leave' });
  eq('16 XP từ cấp 1: lên 2 cấp, +50 +100 máu = 450 (WIKI2 R2, clip wUzq6Q4u9Jc C3 450), 2 phần thưởng chờ', [r.run.level, r.run.healthMax, r.run.pendingLevelUps], [3, 450, 2]);
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
  eq('Fates [RUN-04, WIKI2 R15 wiki Futura]: luôn đúng Bounty, Crossroads, Legacy (không Fortunes)', r.run.phase.choices.map(c => c.id), ['bounty', 'crossroads', 'legacy']);
  eq('Fates: lệnh sai bị từ chối', [R.apply(r.run, { t: 'choose', i: 9 }).ok, R.apply(r.run, { t: 'leave' }).ok], [false, false]);
  const f2 = baseRun(); f2.day = 5; f2.hour = 5; f2.prestige = 1; f2.fatesUsed = true;
  f2.phase = { kind: 'fightResult', combatType: 'PVP', winner: 'opponent', won: false, endMs: 1, seed: 1, rewards: {}, opponent: { kind: 'ghost', name: 'g' }, after: 'endHour' };
  r = R.apply(f2, { t: 'next' });
  eq('Fates lần hai: uy tín về 0 → hết run "prestige"', [r.run.phase.kind, r.run.phase.reason, r.run.prestige], ['end', 'prestige', 0]);
  const lg = baseRun(); lg.prestige = 1; lg.fatesUsed = true; inst(lg, 'tSmall', 'hand', 4, 'Bronze'); inst(lg, 'tSmall', 'hand', 5, 'Silver'); inst(lg, 'tSmall', 'stash', 0, 'Gold');
  const lc = { run: lg, events: [] }; R.enterFates(lc);
  lc.run.phase.choices = R.fatesChoices(lc.run); // cả bốn bước, để chọn đúng Legacy
  const lr = R.apply(lc.run, { t: 'choose', i: lc.run.phase.choices.findIndex(c => c.id === 'legacy') });
  eq('Fates "Fate Legacy": Bronze/Silver → Gold', lr.run.board.hand.concat(lr.run.board.stash).map(c => c.tier), ['Gold', 'Gold', 'Gold']);
  // thua quái giữ vàng theo máu quái đã trừ: mỗi HealthMax/(vàng+1) = +1 vàng (CODE-COMBAT §1.12; clip oVtvrCdqHEE?t=297)
  eq('lossGold: 5 vàng, quái 600 máu: còn 250 → 3; còn 0 → 5; còn 600 → 0; còn 599 → 0', [R.lossGold(5, 600, 250), R.lossGold(5, 600, 0), R.lossGold(5, 600, 600), R.lossGold(5, 600, 599)], [3, 5, 0, 0]);
  const lf = baseRun(); lf.hour = 2; inst(lf, Object.values(globalThis.BZ_CARDS).find(t => t.InternalName === 'Basilisk Fang').Id, 'hand', 3);
  lf.phase = { kind: 'fight', combatType: 'PVE', seed: 7, after: 'endHour', opponent: { kind: 'monster', name: 'dummy', monsterId: null, combatId: null, rewards: { gold: 9, xp: 3 }, board: { name: 'dummy', healthMax: 1000, cards: [] } } };
  r = R.apply(lf, { t: 'fight' });
  eq('thua quái (cọc 1000 máu, thưởng 9 vàng, bị bão cát hạ khi còn 578): vàng thua = floor(422/100) = 4, không XP (WIKI2 R14: XP chỉ khi thắng)', [r.run.phase.won, r.run.phase.rewards], [false, { gold: 4, xp: 0 }]);
  r = R.apply(r.run, { t: 'next' });
  eq('thua quái: nhận 4 vàng, chỉ 1 XP của giờ (không 3 XP quái), sang giờ 3', [r.run.gold, r.run.xp, r.run.hour], [8 + 4, 1, 3]);

  r = pvp(true, 10, 20, 5);
  eq('qua ngày 10 KHÔNG hết run (không có hạn ngày: chỉ 10 thắng hoặc hết uy tín)', [r.run.phase.kind, r.run.day], ['choose', 11]);
  r = R.apply(R.apply(pvp(true, 7, 20, 9).run, { t: 'leave' }).run, { t: 'next' });
  eq('pha end không nhận lệnh', [r.ok, r.run.phase.kind], [false, 'end']);

  // quái giờ 2: ba lựa chọn Đồng / Bạc / Vàng+
  run = baseRun(); run.hour = 2; run.phase = merchantPhase([]); run.hour = 1;
  r = R.apply(run, { t: 'leave' });
  eq('giờ 2 ngày 1: ba quái Đồng / Bạc / Đồng (wiki Monsters ngày 1: 5 Đồng + Viper Bạc, không Vàng; WIKI2 P3: Haunted Kimono Đồng)', [r.run.phase.kind, r.run.phase.options.map(o => o.type), r.run.phase.options.map(o => o.tier === 'Bronze' ? 'B' : o.tier === 'Silver' ? 'S' : 'G+')],
    ['choose', ['combat', 'combat', 'combat'], ['B', 'S', 'B']]);
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
  check('ngày 1: Jay Jay (bộ đọc chữ, bảng bậc bazaardb ngày 1 = 97,4% Đồng / 2,6% Bạc, WIKI2 R6) chỉ Đồng hoặc Bạc, đa số Đồng', (() => { const x = baseRun(); const t = R.deal(x, R.ENCOUNTERS.merchant.filter(byName('Jay Jay')), 30, {}).map(c => c.tier); return t.every(v => v === 'Bronze' || v === 'Silver') && t.filter(v => v === 'Bronze').length >= 25; })());
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
  eq('bóng ngày 3 → danh sách ngày 2, ưu tiên hero khác Vanessa (Bo), máu = healthMax của bản ghi 999 (WIKI2 R3, wiki Day "snapshotted version of their build")',
    [g3.source, g3.name, g3.hero, g3.board.healthMax, g3.board.cards.map(x => [x.uid, x.id, x.tier, x.socket])], ['dataset', 'Bo', 'Dooley', 999, [['g-0', 'tMed', 'Bronze', 4]]]);
  run.day = 6;
  const g6 = R.ENCOUNTERS.combat.ghost(run);
  eq('bóng ngày 6 → ngày 5 chỉ có Vanessa: vẫn dùng (Cy), uid đổi thành g-0, máu của bản ghi 999 (WIKI2 R3)', [g6.name, g6.board.healthMax, g6.board.cards[0].uid], ['Cy', 999, 'g-0']);
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
    r = R.apply(van, { t: 'choose', i: van.phase.choices.indexOf(sc) });
    eq('Vanessa chọn Kỹ năng (WIKI2 R7 wiki Start of Run "Choose a Gold-tier Skill (Choose 1 from 3)"): pha loot 3 kỹ năng bậc Gold, lấy 1',
      [r.run.phase.kind, r.run.phase.picks.length, r.run.phase.take, r.run.phase.picks.every(p => R.isSkill(R.tpl(p.card.id)) && p.card.tier === 'Gold')],
      ['loot', 3, 1, true]);
    r = R.apply(r.run, { t: 'choose', i: 0 });
    eq('chọn kỹ năng mở màn → mở màn tính là giờ 0 (WIKI2 R13 "counts as one of the six hours"): sang giờ 1, +1 XP', [r.ok, r.run.board.skills.length, r.run.phase.kind, r.run.hour, r.run.xp], [true, 1, 'choose', 1, 1]);
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
    const d56 = R.ENCOUNTERS.combat.dayCombats(5).concat(R.ENCOUNTERS.combat.dayCombats(6)).map(c => c.Id);
    eq('"Deadly Duel (Day 5)": vào trận với một quái của danh sách ngày 5 hoặc 6, mọi bậc (WIKI2 E10 wiki Deadly Duel "from your current day or the next day, of any rarity")',
      [r.ok, r.run.phase.kind, d56.indexOf(r.run.phase.opponent.combatId) >= 0], [true, 'fight', true]);
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

// ---------- Sửa theo bản review (D:\bazaar-ref\review\FIXES-RULES.md): số viết tay từ dữ liệu ----------
function fixes() {
  console.log('\n# Sửa theo review (FLOW / INTERACT / MOBILE)');
  let run, r;
  // FLOW-2: không có hạn ngày; chỉ hết run khi 10 trận thắng hoặc hết uy tín
  const pvpD = (won, day, prestige, wins) => {
    const x = baseRun(); x.day = day; x.hour = 5; x.prestige = prestige; x.wins = wins;
    x.phase = { kind: 'fightResult', combatType: 'PVP', winner: won ? 'player' : 'opponent', won, endMs: 1, seed: 1, rewards: {}, opponent: { kind: 'ghost', name: 'g' }, after: 'endHour' };
    return R.apply(x, { t: 'next' });
  };
  r = pvpD(true, 10, 20, 5);
  eq('FLOW-2: thắng PvP ngày 10 (5→6 thắng): KHÔNG hết run, sang ngày 11 giờ 0 chọn gặp gỡ, +5 thu nhập', [r.run.phase.kind, r.run.day, r.run.hour, r.run.wins, r.run.gold], ['choose', 11, 0, 6, 8 + 5]);
  r = pvpD(false, 14, 20, 5);
  eq('FLOW-2: thua PvP ngày 14: uy tín 20 − 14 = 6, run tiếp tục sang ngày 15', [r.run.prestige, r.run.phase.kind, r.run.day], [6, 'choose', 15]);
  r = pvpD(true, 17, 20, 9);
  eq('FLOW-2: thắng PvP thứ 10 ở ngày 17: rương Vàng rồi hết run "victory"', [r.run.phase.kind, r.run.phase.tier, R.apply(r.run, { t: 'leave' }).run.phase.reason], ['chest', 'Gold', 'victory']);
  r = pvpD(false, 17, 5, 3);
  eq('FLOW-2: thua PvP ngày 17 khi uy tín 5 (→ 0) lần đầu: Fates, không hết run', [r.run.phase.kind, r.run.prestige], ['fates', 1]);
  eq('FLOW-2: R.dataDay kẹp 1..10', [0, 1, 10, 11, 17].map(R.dataDay), [1, 1, 10, 10, 10]);
  eq('FLOW-2: bậc theo ngày 15 = Diamond; bảng bậc dòng cuối [0,0,25,75]', [R.bandTier({ day: 15 }), R.TUNING.TIER_ODDS_BY_DAY[9]], ['Diamond', [0, 0, 25, 75]]);
  const lvAt = d => { const s = new Set(); for (let sd = 1; sd <= 60; sd++) { const x = R.newRun({ hero: 'Vanessa', seed: sd }); x.day = d; R.ENCOUNTERS.combat.options(x).forEach(o => s.add(o.level)); } return [Math.min(...s), Math.max(...s)]; };
  eq('FLOW-2: quái giờ PvE ngày 10 cấp 10..15 (PVE_BY_DAY); ngày 11 và 17 giống ngày 10 (không hết quái)', [lvAt(10), lvAt(11), lvAt(17)], [[10, 15], [10, 15], [10, 15]]);
  eq('quái giờ PvE ngày 1 chỉ cấp 1, ngày 6 cấp 6..9 (PVE_BY_DAY theo wiki)', [lvAt(1), lvAt(6)], [[1, 1], [6, 9]]);
  run = baseRun(); run.day = 14; run.hour = 5; R.ENCOUNTERS.combat.enterPvp({ run, events: [] });
  eq('FLOW-2: bóng PvP ngày 14: máu ngoại suy 4062 + 3×700 = 6162, có thẻ trên bàn', [run.phase.opponent.board.healthMax, run.phase.opponent.board.cards.length > 0], [6162, true]);
  let bad = 0;
  for (let sd = 1; sd <= 40; sd++) for (const d of [11, 12, 15]) for (const h of [0, 1, 3, 4]) { const x = R.newRun({ hero: 'Pygmalien', seed: sd }); x.day = d; x.hour = h; if (R.hourOptions(x).length !== 3) bad++; }
  eq('FLOW-2: ngày 11/12/15, giờ tự do: luôn bày đủ 3 gặp gỡ (480 lần)', bad, 0);
  let maxDay = 0; const reasons = {};
  for (let sd = 1; sd <= 30; sd++) { const res = playBot('Vanessa', 7000 + sd, false); maxDay = Math.max(maxDay, res.run.day); reasons[res.run.phase.reason] = 1; }
  check('FLOW-2: 30 run bot: có run qua ngày 10 (ngày lớn nhất ' + maxDay + '), lý do hết run ⊂ {victory, prestige}', maxDay > 10 && Object.keys(reasons).every(k => k === 'victory' || k === 'prestige'), { maxDay, reasons });

  // FLOW-3: {ability.N} / {aura.N} trong chữ gặp gỡ
  const encOf = (kind, name) => Object.values(globalThis.BZ_ENCOUNTERS[kind]).find(e => e.InternalName === name);
  run = baseRun();
  const TX = (kind, name) => R.encText(run, encOf(kind, name), encOf(kind, name).Desc);
  eq('FLOW-3: "Pip (Level Up)" = Gives you 2 Gold…', TX('events', 'Pip (Level Up)'), 'Gives you 2 Gold and teaches Bronze-tier Skills');
  eq('FLOW-3: "Meditation (Level Up)" = Gain 1 XP', TX('steps', 'Meditation (Level Up)'), 'Gain 1 XP');
  eq('FLOW-3 / WIKI2 E15: "Borrow (Day 1-2)" = Lose 1 Income and gain 8 Gold (wiki Borrow 2025-05-18: 8 / 7 / 6; bản demo 9)', TX('events', 'Borrow (Day 1-2)'), 'Lose 1 Income and gain 8 Gold');
  eq('FLOW-3: "Invest" hai số', TX('steps', 'Invest'), 'Gain 2 Income. If you have a Property, gain an additional 2 Income');
  eq('FLOW-3: "Landlord" {ability.0.mod} = 5 vàng mỗi Property, [{ability.0}] = 0 (chưa có)', TX('steps', 'Landlord'), 'Gain 5 Gold for each Property you have (including Stash) [0]');
  eq('FLOW-3: "Get 5 Gumballs (5)": hết khoảng trắng đôi', TX('steps', 'Get 5 Gumballs (5)'), 'Get 5 Gumballs [Gumballs Remaining: 5]');
  eq('FLOW-3: {aura.3} của Quixel/Midsworth/Barkun = 3/2/1', ['Quixel', 'Midsworth', 'Barkun'].map(n => /\+(\d) /.exec(TX('events', n))[1]), ['3', '2', '1']);
  eq('FLOW-3: Shrouded Figure Choose Knowledge/Wealth: {aura.9} = 3 / 30', ['[Shrouded Figure] Choose Knowledge', '[Shrouded Figure] Choose Wealth'].map(n => TX('steps', n)), ['Pick a Chest containing up to 3 XP', 'Pick a Chest containing up to 30 Gold']);
  eq('FLOW-3: "Optimization Protocol": 1000 ms → "1 second"', /by (\S+ second)/.exec(TX('steps', 'Optimization Protocol'))[1], '1 second');
  let raw = 0, total = 0;
  ['events', 'steps', 'pedestals'].forEach(k => Object.values(globalThis.BZ_ENCOUNTERS[k]).forEach(e => { if (/\{/.test(e.Desc || '')) { total++; if (/[{}]/.test(R.encText(run, e, e.Desc))) raw++; } }));
  eq('FLOW-3: mọi mô tả có {…} (' + total + ' thẻ) sau encText không còn dấu ngoặc', raw, 0);
  let leak = 0, seen = 0;
  for (let sd = 1; sd <= 60; sd++) {
    const x = R.newRun({ hero: ['Vanessa', 'Pygmalien', 'Mak', 'Jules'][sd % 4], seed: sd }); x.day = 1 + (sd % 12); x.hour = 0;
    R.hourOptions(x).concat(R.levelUpOptions(x)).forEach(o => { seen++; if (/[{}]/.test(o.desc)) leak++; });
  }
  eq('FLOW-3: hourOptions + levelUpOptions (' + seen + ' thẻ, 60 seed) không rò token', leak, 0);
  run = baseRun(); run.day = 2; run.hour = 1; run.phase = { kind: 'choose', options: [R.encounterRef('event', encOf('events', 'Barkun'))] };
  r = R.apply(run, { t: 'pick', i: 0 });
  eq('FLOW-3: vào thương nhân Barkun: phase.desc = "…Buys your Small items at +1 Value"', r.run.phase.desc, 'Sells Medium and Large items. Buys your Small items at +1 Value');
  run = baseRun(); run.day = 2; run.hour = 1;
  run.phase = { kind: 'event', eventId: 'x', name: 'x', desc: '', choices: [{ kind: 'step', id: encOf('steps', 'Wish for Wealth (1st Wish)').Id, name: 'w', desc: '' }], canExit: true, after: 'endHour' };
  r = R.apply(run, { t: 'choose', i: 0 });
  eq('FLOW-3: bước dẫn tiếp (Then): lựa chọn kế có mô tả đã thay số ("Gain 10 Gold")', r.run.phase.choices.map(c => c.desc).filter(d => /Gain \d+ Gold/.test(d)).slice(0, 1), ['Gain 10 Gold']);

  // FLOW-4: chữ thẻ
  const cardTexts = (name, tier, section) => BZ.cardText({ uid: 'x', id: byCard(name).Id, tier, ench: null, socket: 0, size: 1, section: section || 'hand', mods: {} }).map(x => x.text);
  eq('FLOW-4: Standardized Defenses Bronze/Silver "+6 Shield" / "+18 Shield" (không cụt)', ['Bronze', 'Silver'].map(t => cardTexts('Standardized Defenses', t, 'skills')[0]),
    ['Your Medium items have +6 Shield', 'Your Medium items have +18 Shield']);
  eq('FLOW-4: Mysterious Crystal Bronze/Gold "1 random type" / "3 random types" (hết "type(s)")', ['Bronze', 'Gold'].map(t => cardTexts('Mysterious Crystal', t)[0]),
    ['When you sell this, your leftmost item gains 1 random type', 'When you sell this, your leftmost item gains 3 random types']);
  eq('FLOW-4: Nanobot Silver: "Cooldown is reduced by 1 second" (1000 ms → 1 giây, không "1000 second")', cardTexts('Nanobot', 'Silver')[1], "This item's Cooldown is reduced by 1 second for each adjacent Friend");

  // FLOW-7: Nanobot (BuyPrice 0 ở mọi bậc) không có trong hàng thương nhân
  const M = R.ENCOUNTERS.merchant, jay = encOf('events', 'Jay Jay'), nano = byCard('Nanobot').Id;
  let zero = 0, nanoSeen = 0, stocks = 0;
  for (let sd = 1; sd <= 300; sd++) { const x = R.newRun({ hero: 'Pygmalien', seed: sd }); x.day = 5; M.dealStock(x, jay).forEach(s => { stocks++; if (s.price <= 0) zero++; if (s.card.id === nano) nanoSeen++; }); }
  eq('FLOW-7: Jay Jay (mọi món) ngày 5 × 300 seed (' + stocks + ' thẻ): không món giá 0, không Nanobot', [zero, nanoSeen], [0, 0]);
  eq('FLOW-7: giá gốc của Nanobot Silver vẫn là dữ liệu thật (mua 0, bán 0)', [R.price(R.tpl(nano), 'Silver').buy, R.price(R.tpl(nano), 'Silver').sell], [0, 0]);
  eq('FLOW-7: Small Silver bình thường mua 4 bán 2 (bảng StandardPrices)', [R.price(R.tpl('tSmall'), 'Silver').buy, R.price(R.tpl('tSmall'), 'Silver').sell], [4, 2]);

  // FLOW-8: 6 ô kỹ năng
  run = baseRun(); const sk = Object.values(globalThis.BZ_CARDS).filter(t => R.isSkill(t) && t.Heroes.indexOf('Common') >= 0).slice(0, 7);
  const ctx = { run, events: [] }; const got = sk.map(t => !!R.gainCard(ctx, { id: t.Id, tier: 'Bronze', ench: null }, null, null, 'test'));
  eq('FLOW-8: nhận 7 kỹ năng liên tiếp: 6 đầu được, thứ 7 bị từ chối (SKILL_SLOTS ' + R.TUNING.SKILL_SLOTS + ')', got, [true, true, true, true, true, true, false]);

  // FLOW-10: sự kiện Mimic cấp 11 không bày ở ngày thấp
  const mimicSeen = (day, slack, seeds) => { const old = R.TUNING.EVENT_FIGHT_LEVEL_SLACK; if (slack != null) R.TUNING.EVENT_FIGHT_LEVEL_SLACK = slack; let n = 0;
    for (let sd = 1; sd <= (seeds || 1500); sd++) { const x = R.newRun({ hero: 'Mak', seed: sd }); x.day = day; x.hour = 1; if (R.hourOptions(x).some(o => R.enc().events[o.id] && R.enc().events[o.id].InternalName === 'Treasure Chest (Mimic)')) n++; }
    R.TUNING.EVENT_FIGHT_LEVEL_SLACK = old; return n; };
  eq('FLOW-10: Mimic L11 → cấp quái của thẻ trận = 11', R.ENCOUNTERS.combat.levelOf(encOf('events', 'Treasure Chest (Mimic)').Options[0].id), 11);
  eq('FLOW-10 / WIKI2 E12 (Treasure Chest "(if it is Day 10+) Fight Mimic"): ngày 3 × 1500 seed 0 lần, kể cả bỏ chặn cấp (slack 99); ngày 9 × 500 seed 0; ngày 10 × 500 seed > 0',
    [mimicSeen(3), mimicSeen(3, 99), mimicSeen(9, null, 500), mimicSeen(10, null, 500) > 0], [0, 0, 0, true]);

  // INTERACT-4: kéo thẻ lên bệ = lệnh commit {uid}
  const ped = Object.values(globalThis.BZ_ENCOUNTERS.pedestals).find(e => e.InternalName === 'B1&B2');
  run = baseRun(); run.day = 3; run.hour = 1;
  const a = inst(run, 'tSmall', 'hand', 3, 'Bronze'), b = inst(run, 'tMed', 'hand', 4, 'Gold');
  R.ENCOUNTERS.pedestal.enter({ run, events: [] }, { id: ped.Id }, 'endHour');
  eq('INTERACT-4: bệ "Upgrade a Bronze-tier item": chỉ thẻ Bronze hợp lệ', run.phase.eligible, [a.uid]);
  r = R.apply(run, { t: 'commit', uid: b.uid });
  eq('INTERACT-4: commit thẻ Vàng (không hợp lệ) bị từ chối, run giữ nguyên', [r.ok, r.events[0].reason.indexOf('not eligible') >= 0, r.run === run], [false, true, true]);
  r = R.apply(run, { t: 'commit', uid: a.uid });
  eq('INTERACT-4: commit thẻ Bronze → Silver, bệ xong, sang giờ 2; không bán (vàng giữ 8)', [r.ok, r.run.board.hand.find(c => c.uid === a.uid).tier, r.run.phase.kind, r.run.hour, r.run.gold, types(r).indexOf('sell')], [true, 'Silver', 'choose', 2, 8, -1]);
  r = R.apply(run, { t: 'choose', i: 0 });
  eq('INTERACT-4: lệnh choose {i} cũ vẫn chạy như trước', [r.ok, r.run.board.hand.find(c => c.uid === a.uid).tier], [true, 'Silver']);

  // FLOW-8 / FLOW-9: lý do hết chỗ nằm trong chuỗi lỗi để giao diện nói rõ
  const sk2 = Object.values(globalThis.BZ_CARDS).filter(t => R.isSkill(t) && t.Heroes.indexOf('Common') >= 0).slice(0, 8);
  run = baseRun(); sk2.slice(0, 6).forEach(t => R.gainCard({ run, events: [] }, { id: t.Id, tier: 'Bronze', ench: null }, null, null, 't'));
  const lootOf = (base, cards) => { const x = R.clone(base); x.phase = { kind: 'loot', source: null, picks: cards.map(c => ({ card: c })), take: 1, taken: 0, after: 'endHour' }; return x; };
  eq('FLOW-8: loot kỹ năng khi đủ 6 ô → "(skillsFull)"; kỹ năng đã có → "(skillOwned)"',
    [R.apply(lootOf(run, [{ id: sk2[6].Id, tier: 'Bronze' }]), { t: 'choose', i: 0 }).events[0].reason.slice(-12), R.apply(lootOf(run, [{ id: sk2[0].Id, tier: 'Bronze' }]), { t: 'choose', i: 0 }).events[0].reason.slice(-12)],
    ['(skillsFull)', '(skillOwned)']);
  run = baseRun(); for (let k = 3; k <= 6; k++) inst(run, 'tSmall', 'hand', k, 'Diamond'); for (let k = 0; k < 10; k++) inst(run, 'tSmall', 'stash', k, 'Diamond');
  r = R.apply(lootOf(run, [{ id: 'tMed', tier: 'Bronze' }]), { t: 'choose', i: 0 });
  eq('FLOW-9: hand + stash đầy: loot bị từ chối "(boardFull)", pha loot giữ nguyên, bán một thẻ xong nhận được',
    [r.ok, r.events[0].reason.slice(-11), R.apply(lootOf(run, [{ id: 'tMed', tier: 'Bronze' }]), { t: 'sell', uid: run.board.hand[0].uid }).run.phase.kind], [false, '(boardFull)', 'loot']);
  const sold = R.apply(lootOf(run, [{ id: 'tMed', tier: 'Bronze' }]), { t: 'sell', uid: run.board.hand[0].uid }), sold2 = R.apply(sold.run, { t: 'sell', uid: sold.run.board.hand[0].uid });
  eq('FLOW-9: bán 2 thẻ Small liền nhau trong pha loot → chọn được thẻ Medium (không mất phần thưởng)', [sold2.ok, R.apply(sold2.run, { t: 'choose', i: 0 }).ok], [true, true]);
}

// ---------- FIX6 rulesA: RUN-01/03/04/05/08, CONTENT-02/03/12 (số kỳ vọng viết tay, thất bại trước khi sửa) ----------
function fix6() {
  console.log('\n# FIX6 rulesA');
  const E = globalThis.BZ_ENCOUNTERS;
  const encByName = (k, n) => Object.values(E[k]).find(e => e.InternalName === n);
  const mk = (hero, seed, day) => { const x = R.newRun({ hero: hero || 'Vanessa', seed: seed || 42 }); x.day = day || 3; x.hour = 1; return x; };
  const names = o => o.map(c => c.name);
  const slots = (hero, L) => R.levelUpOptions(mk(hero, 7, 5), L).map(c => c.slot);

  // RUN-01: phần thưởng theo CẤP (wiki Level_Up)
  eq('RUN-01: ô theo cấp 2,3,4,5,7,8', [2, 3, 4, 5, 7, 8].map(L => slots('Vanessa', L).join('+')),
    ['pip', 'item:Bronze+loot:Bronze+heroReward:Bronze', 'upgrade:Bronze+pip', 'argenta', 'upgrade:Silver+argenta', 'orlin+trainer+trainer']);
  eq('RUN-01: ô cấp 10, 11, 14, 19, 20', [10, 11, 14, 19, 20].map(L => slots('Vanessa', L).join('+')),
    ['enchantRandom+artist', 'trainer+trainer+heroTeacher', 'adira+trainer+trainer', 'enchantRandom+enchantRandom+enchantRandom', 'trainer+trainer+trainer']);
  eq('RUN-01: cấp 2 và 5 chỉ MỘT lựa chọn (Pip / Argenta); cấp 4 bày B1&B2 + Pip',
    [names(R.levelUpOptions(mk(), 2)), names(R.levelUpOptions(mk(), 5)), names(R.levelUpOptions(mk(), 4))], [['Pip'], ['Argenta'], ['B1&B2', 'Pip']]);
  eq('RUN-01: thầy riêng hero cấp 11 = Cymon / Mr. Tuskari / Old Zane / Zosima',
    ['Dooley', 'Pygmalien', 'Vanessa', 'Mak'].map(h => names(R.levelUpOptions(mk(h), 11)).pop()), ['Cymon', 'Mr. Tuskari', 'Old Zane', 'Zosima']);
  eq('RUN-01: cấp 19 ba địa điểm enchant khác nhau; cấp 12 bậc Vàng (Forja ở cấp 13)',
    [new Set(R.levelUpOptions(mk(), 19).map(c => c.id)).size, R.levelUpOptions(mk(), 19).every(c => c.type === 'pedestal'), names(R.levelUpOptions(mk(), 13))], [3, true, ['Forja', 'Orlin']]);
  eq('RUN-01: cấp 30 lặp hàng cấp 26, cấp 33 lặp hàng 29', [R.levelRewardRow(30), R.levelRewardRow(33)], [R.levelRewardRow(26), R.levelRewardRow(29)]);
  let r, x = mk(); x.xp = 7; x.phase = merchantPhase([]);
  r = R.apply(x, { t: 'leave' });
  eq('RUN-01: lên cấp 2 qua luồng thật: pha levelUp cấp 2 chỉ có Pip', [r.run.phase.kind, r.run.phase.level, names(r.run.phase.choices)], ['levelUp', 2, ['Pip']]);

  // RUN-05: reroll thầy kỹ năng (RerollRules: Pip 2, Argenta 3, Orlin 6, Adira 8, Zosima 8)
  const rc = (hero, n) => { const y = mk(hero); y.gold = 30; const c = { run: y, events: [] }; R.ENCOUNTERS.event.enter(c, { id: encByName('events', n).Id }, 'beginHour'); return c.run.phase; };
  eq('RUN-05: rerollCost Pip/Argenta/Orlin/Adira/Zosima = 2/3/6/8/8, 1 lần',
    [rc('Vanessa', 'Pip (Level Up)'), rc('Vanessa', 'Argenta (Level Up)'), rc('Vanessa', 'Orlin (Level Up)'), rc('Vanessa', 'Adira (Level Up)'), rc('Mak', 'Zosima (Level Up)')].map(p => p.rerollCost + 'x' + p.rerolls),
    ['2x1', '3x1', '6x1', '8x1', '8x1']);
  x = mk(); x.gold = 30; let c6 = { run: x, events: [] }; R.ENCOUNTERS.event.enter(c6, { id: encByName('events', 'Orlin (Level Up)').Id }, 'beginHour');
  const before = c6.run.phase.picks.map(p => p.card.id), g0 = c6.run.gold;
  r = R.apply(c6.run, { t: 'reroll' });
  eq('RUN-05: reroll trừ 6 vàng, chia lại 3 kỹ năng bậc Vàng khác hẳn thẻ cũ, hết lượt',
    [r.ok, g0 - r.run.gold, r.run.phase.picks.length, r.run.phase.picks.every(p => before.indexOf(p.card.id) < 0 && p.card.tier === 'Gold'), r.run.phase.rerolls],
    [true, 6, 3, true, 0]);
  eq('RUN-05: lượt reroll thứ hai bị từ chối; thiếu vàng cũng từ chối', [R.apply(r.run, { t: 'reroll' }).ok, (() => { c6.run.gold = 5; return R.apply(c6.run, { t: 'reroll' }).ok; })()], [false, false]);
  check('RUN-05: legal() có reroll khi đủ vàng', R.legal(Object.assign(R.clone(c6.run), { gold: 9 })).some(m => m.t === 'reroll'));

  // RUN-03: lựa chọn có điều kiện
  const tiny = encByName('events', 'Tiny Furry Creature'), cond = ['Feed It', 'Play Hide and Seek', 'Play With It'];
  const seenNames = (setup, seeds) => { const seen = new Set(); for (let sd = 1; sd <= seeds; sd++) { const y = mk('Vanessa', sd, 1); setup(y); const c = { run: y, events: [] }; R.ENCOUNTERS.event.enter(c, { id: tiny.Id }, 'endHour'); c.run.phase.choices.forEach(o => seen.add(o.name)); } return seen; };
  const foodTpl = Object.values(globalThis.BZ_CARDS).find(t => t.Type === 'Item' && (t.Tags || []).indexOf('Food') >= 0 && t.Size === 'Small' && t.Heroes.indexOf('Common') >= 0);
  const noFood = seenNames(() => {}, 60), withFood = seenNames(y => inst(y, foodTpl.Id, 'hand', 3), 60);
  eq('RUN-03: bàn trống 60 seed: không bao giờ bày "Feed It" / "Hide and Seek" / "Play With It"', cond.filter(n => noFood.has(n)), []);
  eq('RUN-03: có một thẻ tag Food: "Feed It" xuất hiện, hai bước kia vẫn ẩn', [withFood.has('Feed It'), withFood.has('Play Hide and Seek'), withFood.has('Play With It')], [true, false, false]);
  x = mk(); x.phase = { kind: 'event', eventId: tiny.Id, name: 't', desc: '', choices: [{ kind: 'step', id: encByName('steps', 'Feed It').Id, name: 'Feed It', desc: '' }], canExit: true, after: 'endHour' };
  r = R.apply(x, { t: 'choose', i: 0 });
  eq('RUN-03: ép chọn "Feed It" khi không có Food: bị từ chối, không vào pha loot, không XP', [r.ok, r.events[0].reason, r.run.phase.kind, r.run.xp], [false, 'step condition not met: no Food in hand or stash', 'event', 0]);
  eq('RUN-03: phân tích điều kiện', [R.ENCOUNTERS.step.conditionOf(encByName('steps', 'Play With It')), R.ENCOUNTERS.step.conditionOf(encByName('steps', 'Jungle Ruins (Search for Abanadoned Tools)')), R.ENCOUNTERS.step.conditionOf(encByName('steps', 'Feed It')).kind],
    [{ kind: 'have', terms: ['Toy', 'Drone'] }, { kind: 'are', terms: ['Dooley', 'Stelle'] }, 'have']);

  // RUN-04: Fates thật
  const fe = encByName('events', 'Futura');
  eq('RUN-04: Futura có 4 bước thật', R.fatesChoices(mk()).map(c => c.name).sort(), ["Fate's Bounty", "Fate's Crossroads", "Fate's Fortunes", "Fate's Legacy"]);
  const fates = (hero) => { const y = mk(hero, 11, 5); const c = { run: y, events: [] }; R.enterFates(c); c.run.phase.choices = R.fatesChoices(c.run); return c.run; };
  let f = fates(); r = R.apply(f, { t: 'choose', i: f.phase.choices.findIndex(c => c.id === 'bounty') });
  eq("RUN-04: Fate's Bounty = +20 vàng, +5 XP (số từ ability.1 / ability.0 của bước)", [r.ok, r.run.gold - f.gold, r.run.xp - f.xp, r.run.phase.kind], [true, 20, 5, 'choose']);
  eq("RUN-04: mô tả Bounty đã thay số: 'Gain 20 Gold and 5 XP'", R.fatesChoices(f).find(c => c.id === 'bounty').desc, 'Gain 20 Gold and 5 XP');
  r = R.apply(f, { t: 'choose', i: f.phase.choices.findIndex(c => c.id === 'crossroads') });
  eq("RUN-04: Fate's Crossroads → hai địa điểm: một enchant ngẫu nhiên (bệ Diamond) hoặc The Artist", [r.run.phase.kind, r.run.phase.choices.map(c => c.kind + ':' + c.slot), r.run.phase.choices[1].name, r.run.phase.after],
    ['event', ['pedestal:enchantRandom', 'pedestal:artist'], 'The Artist', 'beginHour']);
  const cr = R.apply(r.run, { t: 'choose', i: 1 });
  eq('RUN-04: chọn The Artist từ Crossroads → pha bệ', [cr.ok, cr.run.phase.kind, cr.run.phase.name], [true, 'pedestal', 'The Artist']);
  const ench = Object.values(globalThis.BZ_CARDS).filter(t => t.Type === 'Item' && t.Size === 'Small' && t.StartingTier === 'Bronze' && t.Heroes.indexOf('Common') >= 0 && Object.keys(t.Enchantments || {}).length > 2).slice(0, 2);
  f = fates(); ench.forEach((t, k) => inst(f, t.Id, 'hand', 3 + k, 'Bronze'));
  r = R.apply(f, { t: 'choose', i: f.phase.choices.findIndex(c => c.id === 'fortunes') });
  eq("RUN-04: Fate's Fortunes: mọi vật phẩm được enchant, vẫn 2 món", [r.ok, r.run.board.hand.length, r.run.board.hand.every(ci => !!ci.ench)], [true, 2, true]);

  // RUN-08: The Artist cho người chơi chọn enchant
  const art = encByName('pedestals', 'The Artist (Level Up)'), at = ench[0];
  x = mk(); const ai = inst(x, at.Id, 'hand', 3, 'Bronze');
  R.ENCOUNTERS.pedestal.enter({ run: x, events: [] }, { id: art.Id }, 'endHour');
  r = R.apply(x, { t: 'commit', uid: ai.uid });
  const wantOpts = Object.keys(at.Enchantments);
  eq('RUN-08: chọn thẻ ở The Artist → pha enchantPick liệt kê đủ enchant của thẻ, chưa yểm', [r.ok, r.run.phase.kind, r.run.phase.options, r.run.board.hand[0].ench], [true, 'enchantPick', wantOpts, null]);
  const pickE = wantOpts[1];
  r = R.apply(r.run, { t: 'choose', i: 1 });
  eq('RUN-08: chọn enchant thứ hai → thẻ mang đúng enchant đó, qua giờ', [r.ok, r.run.board.hand[0].ench, r.run.phase.kind, r.run.hour], [true, pickE, 'choose', 2]);
  eq('RUN-08: enchant không thuộc thẻ bị từ chối', R.apply(R.apply(x, { t: 'commit', uid: ai.uid }).run, { t: 'choose', ench: 'NoSuchEnchant' }).ok, false);

  // CONTENT-02 / 03
  let travel = 0, leg = {}, early = 0, N = 0;
  for (let d = 1; d <= 10; d++) for (let sd = 1; sd <= 200; sd++) {
    const y = mk('Vanessa', sd, d); y.prev = [];
    R.hourOptions(y).forEach(o => { N++; if (o.name === 'The Travel Agent') travel++; if (o.tier === 'Legendary') { if (d < 8 && o.name !== 'Freiya') early++; else leg[o.name] = (leg[o.name] || 0) + 1; } });
  }
  eq('CONTENT-02: Travel Agent không bao giờ được bày (2000 lần chia)', travel, 0);
  eq('CONTENT-03 / WIKI2 E13: không còn bảng bậc gặp gỡ; gặp gỡ Legendary không có ngày riêng mở từ ngày 10 (wiki Frozen Tomb "Day 10+")', [R.TUNING.ENCOUNTER_TIER_ODDS_WITH_LEGENDARY, R.TUNING.DAYS_BY_TIER.Legendary], [undefined, [10, 99]]);
  eq('CONTENT-03: Legendary trước ngày 8 = 0 lần, trừ Freiya (bazaardb days_active 5-10; WIKI2 E13 bỏ bảng bậc tự đặt)', early, 0);
  const legNames = Object.keys(leg);
  check('CONTENT-03: từ ngày 8 có Legendary; Freiya xuất hiện được, Statia KHÔNG (WIKI2 E5: chỉ ở lần uy tín về 0 đầu tiên)', legNames.indexOf('Freiya') >= 0 && legNames.indexOf('Statia') < 0, leg);
  check('CONTENT-03: ít nhất một bệ Legendary (Yetarian Tomb / Arcane Abyss / Sanguine Valley) tới được', ['Yetarian Tomb', 'Arcane Abyss', 'Sanguine Valley'].some(n => legNames.indexOf(n) >= 0), leg);

  // CONTENT-12: Bex
  const bx = n => { const e = encByName('steps', n); return R.encText(mk(), e, e.Desc); };
  eq('CONTENT-12: Bex 1st Quarter / Wins - Bet / Lose - Bet đủ số, không còn "?"', [bx('[Bex] 1st Quarter'), bx('[Bex] Wins - Bet').split('\n')[0], bx('[Bex] Lose - Bet').split('\n')[1]],
    ['Roughtown Kyvers: 2\nRiver District Rogues: 1', 'The Kyvers defeat the Rogues 8-5!', 'You lost your bet of 5 Gold.']);
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

// ---------- fix8: bể, bậc theo ngày, giá bán, tỉ lệ lựa chọn từ bazaardb.gg (data/shops.js) ----------
function fix8() {
  console.log('\n# fix8 (bazaardb)');
  const S = globalThis.BZ_SHOPS, EV = globalThis.BZ_ENCOUNTERS.events;
  const byName = n => Object.values(EV).find(e => e.InternalName === n);
  check('data/shops.js nạp được: thương nhân, thầy, sự kiện, bảng bậc 16 ngày', !!S && Object.keys(S.merchants).length > 40 && Object.keys(S.trainers).length > 15 && Object.keys(S.events).length > 30 && S.tierOdds.length === 16,
    S && [Object.keys(S.merchants).length, Object.keys(S.trainers).length, S.tierOdds.length]);
  // Aila ngày 1: mọi thẻ chia ra thuộc bể bazaardb của Aila, lọc theo hero (Vanessa + Common)
  const aila = byName('Aila'), pool = new Set(S.merchants[aila.Id].pool);
  const run = baseRun('Vanessa'); run.day = 1;
  let outside = 0, wrongHero = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    R.ENCOUNTERS.merchant.dealStock(run, aila).forEach(s => {
      n++;
      if (!pool.has(s.card.id)) outside++;
      const hs = R.tpl(s.card.id).Heroes || [];
      if (hs.indexOf('Vanessa') < 0 && hs.indexOf('Common') < 0) wrongHero++;
    });
  }
  check('Aila ngày 1: ' + n + ' thẻ đều trong bể bazaardb, 0 thẻ hero khác', n > 600 && outside === 0 && wrongHero === 0, { n, outside, wrongHero });
  check('Aila chỉ bán Weapon (bể bazaardb "Sells Weapons")', R.ENCOUNTERS.merchant.dealStock(run, aila).every(s => (R.tpl(s.card.id).Tags || []).concat(R.tpl(s.card.id).HiddenTags || []).indexOf('Weapon') >= 0));
  // phân bố bậc 2000 lượt chia so với tierOdds của ngày 1 và ngày 9 (sai số ≤ 2 điểm phần trăm)
  [1, 9].forEach(day => {
    const r2 = baseRun('Vanessa'); r2.day = day;
    const cnt = { Bronze: 0, Silver: 0, Gold: 0, Diamond: 0 };
    for (let i = 0; i < 2000; i++) cnt[R.dealShop(r2, aila, 1, {})[0].tier]++;
    const row = S.tierOdds[day - 1];
    const worst = Math.max(...['Bronze', 'Silver', 'Gold', 'Diamond'].map(t => Math.abs(cnt[t] / 20 - row[t.toLowerCase()])));
    check('bậc ngày ' + day + ' lệch tối đa ' + worst.toFixed(2) + ' điểm so với tierOdds ' + JSON.stringify([row.bronze, row.silver, row.gold, row.diamond]), worst <= 2, cnt);
  });
  // luật bậc riêng: Goldie toàn Gold, Curio toàn Bronze; thẻ không bao giờ dưới StartingTier
  const rg = baseRun('Mak'); rg.day = 5;
  const gold = [].concat(...Array.from({ length: 100 }, () => R.ENCOUNTERS.merchant.dealStock(rg, byName('Goldie'))));
  check('Goldie: ' + gold.length + ' thẻ đều bậc Gold', gold.length > 100 && gold.every(s => s.card.tier === 'Gold'));
  const cur = [].concat(...Array.from({ length: 100 }, () => R.ENCOUNTERS.merchant.dealStock(rg, byName('Curio'))));
  check('Curio: ' + cur.length + ' thẻ đều bậc Bronze và Common', cur.length > 100 && cur.every(s => s.card.tier === 'Bronze' && R.tpl(s.card.id).Heroes.indexOf('Common') >= 0));
  check('không thẻ nào chia dưới StartingTier', gold.concat(cur).every(s => R.tierIndex(s.card.tier) >= R.tierIndex(R.tpl(s.card.id).StartingTier || 'Bronze')));
  // Midsworth mua Medium +2, Small và Large không cộng; Barkun Small +1; Quixel Large +3
  [['Midsworth', 'tMed', 4], ['Midsworth', 'tSmall', 1], ['Midsworth', 'tLarge', 3], ['Barkun', 'tSmall', 2], ['Quixel', 'tLarge', 6]].forEach(([m, id, want]) => {
    const rs = baseRun(); const ci = inst(rs, id, 'hand', 3);
    rs.phase = Object.assign(merchantPhase([]), { merchantId: byName(m).Id });
    eq(m + ' mua ' + id + ' Bronze (giá bán gốc +bonus)', R.sellPrice(rs, ci.uid), want);
  });
  // đổi hàng: 1 lần, giá theo bậc thương nhân từ bazaardb (Aila Bronze 2, Goldie Gold 4, Chronos Kim cương 8), không tăng giá
  [['Aila', 2], ['Goldie', 4], ['Barkun', 3]].forEach(([m, cost]) => {
    const rm = baseRun(); rm.day = 6; const c = { run: rm, events: [] };
    R.ENCOUNTERS.merchant.enter(c, { id: byName(m).Id }, 'endHour');
    eq(m + ': số lần đổi hàng và giá', [rm.phase.rerolls, rm.phase.rerollCost, rm.phase.rerollStep], [1, cost, 0]);
  });
  // Valpak luôn có một thẻ giảm giá
  const rv = baseRun(); rv.day = 3;
  check('Valpak: mọi lần chia có đúng một thẻ giảm giá', Array.from({ length: 30 }, () => R.ENCOUNTERS.merchant.dealStock(rv, byName('Valpak'))).every(st => st.filter(s => s.discount).length === 1));
  // ngày có thẻ: Goldie chỉ từ ngày 5, Curio ngày 2..5
  const seen = {};
  for (let d = 1; d <= 12; d++) {
    const rd = baseRun(); rd.day = d;
    for (let i = 0; i < 80; i++) R.hourOptions(rd).forEach(o => { seen[o.name] = seen[o.name] || new Set(); seen[o.name].add(Math.min(d, 10)); });
  }
  const mn = n => Math.min(...seen[n]), mx = n => Math.max(...seen[n]);
  check('Goldie chỉ hiện từ ngày 5; Curio chỉ ngày 2..5', seen.Goldie && seen.Curio && mn('Goldie') === 5 && mn('Curio') === 2 && mx('Curio') === 5, [seen.Goldie && [...seen.Goldie], seen.Curio && [...seen.Curio]]);
  // sự kiện: bazaardb chỉ có 1 sự kiện web-khớp-được với ô ngẫu nhiên không điều kiện (Shrouded Figure), còn lại là lựa chọn có điều kiện
  // "(if you have X)" mà tỉ lệ chỉ đo số người đủ điều kiện → luôn hiện khi đủ. Thử bộ chọn theo tỉ lệ trên The Lost Crate: ô "Open It" đặt tay 30 % (ô kia không có dữ liệu nên luôn hiện).
  const bex = byName('The Lost Crate'), brec = S.events[bex.Id], saved = JSON.stringify(brec.choices);
  delete brec.choices[0].cond; brec.choices[0].odds = { all: 30 }; const limit0 = bex.Limit; bex.Limit = 3; // Limit 2 đã đủ chỗ cho hai ô luôn hiện
  const cnt = {};
  for (let i = 0; i < 1500; i++) {
    const re = R.newRun({ hero: 'Vanessa', seed: 100 + i }); re.day = 6; const c = { run: re, events: [] };
    R.ENCOUNTERS.event.enter(c, { id: bex.Id }, 'endHour');
    cnt[re.phase.choices.length] = (cnt[re.phase.choices.length] || 0) + 1;
    re.phase.choices.forEach(ch => { cnt[ch.name] = (cnt[ch.name] || 0) + 1; });
  }
  brec.choices = JSON.parse(saved); bex.Limit = limit0;
  const first = brec.choices[0].title;
  check('tỉ lệ 30 %: "' + first + '" hiện ≈ 30 % số lần (đo ' + (cnt[first] / 15).toFixed(1) + ' %)', Math.abs(cnt[first] / 15 - 30) < 4, cnt);
  // lựa chọn có điều kiện vẫn do điều kiện quyết (không tung tỉ lệ): Aerodrome thiếu Billboard / Gatling Gun thì không ra lựa chọn đó
  const ra = baseRun(); ra.day = 6; R.ENCOUNTERS.event.enter({ run: ra, events: [] }, { id: byName('Aerodrome').Id }, 'endHour');
  // đợt 9b: mọi lựa chọn đều thiếu điều kiện thì không bày phần thưởng bịa: vào sự kiện là xong (và clock.js không bày Aerodrome)
  const rac = ra.phase.choices || [];
  check('Aerodrome không có Billboard / Gatling Gun: lựa chọn điều kiện bị ẩn (' + rac.length + ' lựa chọn, pha ' + ra.phase.kind + ')', rac.every(c => !/Billboard|Defense/.test(c.name) && c.kind !== 'generic'), rac.map(c => c.name));
  // huy hiệu cam (stamp): D'flek Upgrade = 10, Enchant = 20; Gumball "Gumballs Remaining: 5" = 5
  const df = byName("D'flek"), rf = baseRun(); rf.day = 8; rf.hero = (df.Heroes && df.Heroes[0] !== 'Common' ? df.Heroes[0] : 'Vanessa');
  // đợt 9c (P1-9): lựa chọn "leftmost Shield item" không có đích thì ẩn → đặt một món Shield (Pearl) trên tay để bốn lựa chọn đều hiện
  inst(rf, Object.keys(globalThis.BZ_CARDS).find(id => R.title(globalThis.BZ_CARDS[id]) === 'Pearl'), 'hand', 3);
  R.ENCOUNTERS.event.enter({ run: rf, events: [] }, { id: df.Id }, 'endHour');
  const st = {}; rf.phase.choices.forEach(c => { st[c.name] = c.stamp; });
  eq("D'flek: huy hiệu giá theo wiki D'fleck (WIKI2 E1): Exploit miễn phí, Reinforce 5, Upgrade 10, Enchant 20", [st.Exploit, st.Upgrade, st.Enchant, st.Reinforce], [undefined, 10, 20, 5]);
  const gum = Object.values(globalThis.BZ_ENCOUNTERS.steps).find(x => /Gumballs Remaining: 5\]/.test(x.Desc || ''));
  eq('Gumball: stamp = 5 từ "[Gumballs Remaining: 5]"', R.ENCOUNTERS.event.optionChoice({ t: 'step', id: gum.Id }, rf, null).stamp, 5);
  console.log('    đếm rơi về bộ đọc chữ: ' + JSON.stringify(R.shopStats));
}

// Đợt 9 (2026-10-22): chủ dự án thấy sạp có đồ quái rơi, mua Gumball ra món khác, sạp chỉ bán đồ nhỏ lại có đồ lớn
function fix9() {
  console.log('\n# Đợt 9: hàng và phần thưởng đúng chữ');
  const E = globalThis.BZ_ENCOUNTERS, titleOf = id => R.title(R.tpl(id)), tagsOf = id => (R.tpl(id).Tags || []).concat(R.tpl(id).HiddenTags || []);
  const gum5 = Object.values(E.steps).find(x => x.InternalName === 'Get 5 Gumballs (5)');
  const got = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const ctx = { run: R.newRun({ hero: 'Vanessa', seed }), events: [] };
    ctx.run.day = 3;
    R.ENCOUNTERS.step.resolve(ctx, gum5, 'endHour');
    ctx.events.filter(v => v.type === 'gain').forEach(v => got.add(titleOf(v.id)));
    if (ctx.run.phase.kind === 'loot') ctx.run.phase.picks.forEach(p => got.add(titleOf(p.card.id)));
  }
  eq('"Get 5 Gumballs" × 40 seed: chỉ ra Gumball (không Gumball Machine, không món khác)', [...got].sort(), ['Blue Gumball', 'Green Gumball', 'Red Gumball', 'Yellow Gumball']);

  // bản demo cho mọi hero, bản live (bazaardb pool_per_hero_counts) không có hàng cho hero đó
  const offered = {};
  ['Vanessa', 'Pygmalien'].forEach(hero => {
    offered[hero] = new Set();
    for (let seed = 1; seed <= 150; seed++) {
      const run = R.newRun({ hero, seed });
      for (const day of [1, 3, 5, 7, 9]) { run.day = day; R.hourOptions(run).forEach(o => offered[hero].add(o.name)); }
    }
  });
  eq("Vanessa × 150 seed × 5 ngày: không gặp Kev's Armory, The Tester", ["Kev's Armory", 'The Tester'].filter(n => offered.Vanessa.has(n)), []);
  eq('Pygmalien: không gặp Knightshade (Poison), Pol (Large); vẫn gặp Mr. Morland', [offered.Pygmalien.has('Knightshade'), offered.Pygmalien.has('Pol'), offered.Pygmalien.has('Mr. Morland')], [false, false, true]);

  const bad = [];
  Object.values(E.events).filter(e => e.Kind === 'merchant' && !R.TUNING.ENCOUNTER_EXCLUDE.test(e.InternalName)).forEach(e => {
    const rec = R.shopRec(e), inPool = new Set((rec && rec.pool) || []), sizes = R.parseFilter(e.Desc || '').sizes;
    R.HEROES_PLAYABLE.forEach(hero => {
      if (!R.shopHeroOk(e, { hero })) return;
      for (let seed = 1; seed <= 8; seed++) {
        const run = R.newRun({ hero, seed });
        run.day = 1 + seed;
        R.ENCOUNTERS.merchant.dealStock(run, e).forEach(s => {
          const id = s.card.id, t = R.tpl(id);
          if (e.InternalName !== 'Curio' && (R.isMonsterItem(t) || (tagsOf(id).includes('Loot') && !inPool.has(id)))) bad.push(e.InternalName + ': Loot ' + titleOf(id));
          if (sizes && !R.isSkill(t) && !sizes.includes(t.Size)) bad.push(e.InternalName + ': ' + t.Size + ' ' + titleOf(id));
        });
      }
    });
  });
  eq('R.isMonsterLoot: Sharpening Stone, Bar of Gold, Chunk of Gold, Catalyst (Loot của Mak, wiki collection Monster/Junk: WIKI2 M3) có; Coincure không',
    ['Sharpening Stone', 'Bar of Gold', 'Chunk of Gold', 'Catalyst', 'Coincure'].map(n => R.isMonsterLoot(Object.values(globalThis.BZ_CARDS).find(t => R.title(t) === n))), [true, true, true, true, false]);
  eq('mọi thương nhân trừ Curio × hero được bày × 8 seed: không đồ của quái (wiki collection Monster/Junk, WIKI2 M2), cỡ đúng chữ "Sells Small/Medium/Large"', [...new Set(bad)].slice(0, 6), []);

  const run = R.newRun({ hero: 'Vanessa', seed: 3 });
  const potions = R.deal(run, R.parseFilter('Get a Potion'), 6, { tierMode: 'band' });
  eq('"Get a Potion" cho Vanessa (bể Vanessa không có Potion): 6 thẻ, đều mang tag Potion', [potions.length, potions.every(c => tagsOf(c.id).includes('Potion'))], [6, true]);
  const small = R.deal(run, R.parseFilter('Get a Small item'), 20, {});
  eq('"Get a Small item": 20 thẻ Small, không đồ Loot', [small.length, small.filter(c => R.tpl(c.id).Size !== 'Small' || tagsOf(c.id).includes('Loot')).map(c => titleOf(c.id))], [20, []]);
}

// Đợt 9b (2026-10-22): "nhiều logic/cơ chế không chạy" — audit D:\bazaar-ref\review9\OOC.md (RC1-RC10) và ENC.md (A-X).
// Mỗi nguyên nhân gốc một khẳng định hành vi với số viết tay; báo cáo: D:\bazaar-ref\review9\FIX-M.md
function fix9b() {
  console.log('\n# Đợt 9b: mechanics ngoài trận và gặp gỡ');
  const C = globalThis.BZ_CARDS, E = globalThis.BZ_ENCOUNTERS;
  const idOf = n => Object.keys(C).find(id => R.title(C[id]) === n && !/DEBUG|Debug/.test(C[id].InternalName));
  const step = n => Object.values(E.steps).find(x => x.InternalName === n);
  const event = n => Object.values(E.events).find(x => x.InternalName === n);
  const titleOf = id => R.title(R.tpl(id)), tagsOf = id => (R.tpl(id).Tags || []).concat(R.tpl(id).HiddenTags || []);
  const titles = run => R.allCards(run).map(c => titleOf(c.id));
  const gains = ctx => ctx.events.filter(v => v.type === 'gain').map(v => titleOf(v.id));
  const fresh = (hero, seed) => {
    const run = R.newRun({ hero, seed: seed || 5 });
    run.board.hand = []; run.board.stash = []; run.board.skills = []; run.phase = { kind: 'choose', options: [] }; run.day = 3; run.hour = 1;
    return run;
  };
  const resolve = (run, name) => { const ctx = { run, events: [] }; R.ENCOUNTERS.step.resolve(ctx, step(name), 'endHour'); return ctx; };

  // RC2 / ENC F: TActionCardDestroy bị bỏ qua (FALLBACK null) → sim phá, readBack xoá khỏi run.board
  let run = fresh('Mak'); inst(run, idOf('Med Kit'), 'hand', 3); inst(run, idOf('Peacewrought'), 'hand', 4); run.gold = 10;
  run.phase = { kind: 'choose', options: [R.encounterRef('merchant', event('Jay Jay'))] };
  let r = R.apply(run, { t: 'pick', i: 0 });
  eq('RC2 Peacewrought: vào thương nhân → Med Kit bên trái bị phá, +2 vàng', [titles(r.run).includes('Med Kit'), r.run.gold - 10], [false, 2]);
  run = fresh('Karnok'); inst(run, idOf('Ancient Locket'), 'hand', 3, 'Silver');
  let ctx = resolve(run, '[Shrouded Figure] Sacrifice Ancient Locket');
  eq('ENC F Sacrifice Ancient Locket: Locket mất, +2 XP', [titles(run).includes('Ancient Locket'), ctx.events.filter(v => v.type === 'xp' && v.why === 'effect').map(v => v.delta)], [false, [2]]);

  // RC1: lên cấp không bắn trigger → R.gainXp bắn OnPlayerAttributeChanged Level / HealthMax
  run = fresh('Pygmalien'); inst(run, idOf('Money Tree'), 'hand', 2); inst(run, idOf('Lion Cane'), 'hand', 5, 'Gold');
  let hm0 = run.healthMax; ctx = { run, events: [] }; R.gainXp(ctx, 8, 'test');
  eq('RC1 lên cấp 1→2: Money Tree +1 Spare Change, máu tối đa +50 (bảng cấp WIKI2 R2: 300 → 350) +100 (Lion Cane)', [gains(ctx), run.healthMax - hm0], [['Spare Change'], 150]);

  // ENC C / RC7: "gains the X type" (addTags) không lưu → inst.tags, sim đọc lại
  run = fresh('Vanessa'); const mk = inst(run, idOf('Med Kit'), 'hand', 3);
  resolve(run, 'Food Training');
  const simC = R.readState(run).cards.find(c => c.uid === mk.uid);
  eq('ENC C Food Training: Med Kit (thẻ trái nhất) mang loại Food, sim thấy tag Food', [R.findCard(run, mk.uid).tags, !!simC.tags.Food], [['Food'], true]);

  // ENC A: chữ không nêu thẻ → trước chia một vật phẩm ngẫu nhiên; nay bảng St.FX hoặc không gì
  run = fresh('Vanessa'); run.day = 2; ctx = resolve(run, 'Med Kit (Level Up)');
  eq('ENC A Med Kit (Level Up) ngày 2: được đúng 2 Med Kit', gains(ctx), ['Med Kit', 'Med Kit']);
  run = fresh('Vanessa'); ctx = resolve(run, 'Haddy - Spin the Wheel');
  const prizes = ['Bag of Gold', "Haddy's Hat Reward", 'Diamond Skill', 'Haddy - Enchanted Item', 'Mystery Bundle', 'Gold Skill'].map(n => /^Haddy/.test(n) ? n : 'Haddy - ' + n);
  eq('ENC A Spin the Wheel: không vật phẩm; bày đúng 1 giải của Haddy', [gains(ctx).length, run.phase.kind, (run.phase.choices || []).length, (run.phase.choices || []).every(c => prizes.includes((E.steps[c.id] || {}).InternalName))], [0, 'event', 1, true]);
  run = fresh('Vanessa'); let g0 = run.gold; ctx = resolve(run, '[Shrouded Figure] Choose Wealth');
  eq('ENC A Choose Wealth ("up to 30 Gold"): 1..30 vàng, không vật phẩm', [run.gold - g0 >= 1 && run.gold - g0 <= 30, gains(ctx).length], [true, 0]);

  // RC5: R.gold không bắn trigger vàng → Healthy Tip "permanently gain Max Health equal to 1 times the amount"
  run = fresh('Pygmalien'); inst(run, idOf('Healthy Tip'), 'hand', 3, 'Silver'); hm0 = run.healthMax;
  R.gold({ run, events: [] }, 5, 'test');
  eq('RC5 Healthy Tip: +5 vàng → máu tối đa +5', run.healthMax - hm0, 5);

  // RC4: OnCardSelected không bắn → R.gainCard (mua / nhặt) bắn cho chính thẻ
  run = fresh('Vanessa'); run.gold = 3; run.phase = merchantPhase([{ card: { id: idOf('Red Envelope'), tier: 'Bronze', ench: null }, price: 0 }]);
  r = R.apply(run, { t: 'buy', i: 0 });
  eq('RC4 Red Envelope: mua (giá 0) → +10 vàng', r.run.gold, 13);

  // RC3: Transform không biết đích → đọc chữ sau "into"
  const into = [];
  for (let seed = 1; seed <= 12; seed++) {
    run = fresh('Mak', seed); const sm = inst(run, idOf('Med Kit'), 'hand', 2); inst(run, idOf('Alembic'), 'hand', 3, 'Silver');
    R.ooc.fire({ run, events: [] }, 'TTriggerOnDayStarted', {});
    into.push(tagsOf(R.findCard(run, sm.uid).id).includes('Potion'));
  }
  eq('RC3 Alembic × 12 seed: Small bên trái thành Potion', into.filter(Boolean).length, 12);

  // RC6: TActionGameReroll ngoài cửa hàng chỉ ghi chú → đổi ô cuối của màn chọn gặp gỡ
  run = fresh('Stelle'); run.phase = { kind: 'choose', options: R.hourOptions(run) }; const ids0 = run.phase.options.map(o => o.id);
  const cp = inst(run, idOf('Compass'), 'hand', 3);
  r = R.apply(run, { t: 'sell', uid: cp.uid });
  const ids1 = r.run.phase.options.map(o => o.id);
  eq('RC6 Compass Bronze bán ở giờ 1: đổi đúng 1 gặp gỡ (ô cuối), 2 ô đầu giữ nguyên', [ids1.length, ids1.filter((id, i) => id !== ids0[i]).length, ids1[0] === ids0[0] && ids1[1] === ids0[1]], [3, 1, true]);

  // RC8: "gain access to the genie Rit" bỏ qua → sự kiện Rit vào màn chọn
  run = fresh('Vanessa'); run.phase = { kind: 'choose', options: R.hourOptions(run) };
  const gl = inst(run, idOf('Genie Lamp'), 'hand', 3, 'Diamond');
  r = R.apply(run, { t: 'sell', uid: gl.uid });
  eq('RC8 Genie Lamp bán ở màn chọn: có lựa chọn Rit, vẫn 3 lựa chọn', [r.run.phase.options.some(o => o.id === event('Rit').Id), r.run.phase.options.length], [true, 3]);

  // RC9: OnCardAttributeChanged ngoài trận không bắn → Chimeric Egg nâng bậc khi giá trị chạm 10
  run = fresh('Vanessa'); const egg = inst(run, idOf('Chimeric Egg'), 'hand', 3);
  egg.mods = { SellPrice: 6 - R.simCard(egg).attrs.SellPrice };
  R.ooc.fire({ run, events: [] }, 'TTriggerOnDayStarted', {});
  eq('RC9 Chimeric Egg giá trị 6 → đầu ngày +4 = 10 → lên Silver', [R.simCard(egg).attrs.SellPrice >= 10, egg.tier], [true, 'Silver']);

  // RC10: OnFightEnded truyền outcome 'Loss', dữ liệu ghi 'Lose' → Stained Glass Window không bao giờ bị phá khi thua
  run = fresh('Pygmalien'); run.day = 8; inst(run, idOf('Stained Glass Window'), 'hand', 3, 'Gold');
  ctx = { run, events: [] }; R.ENCOUNTERS.combat.enter(ctx, { id: Object.values(E.combats).find(c => c.InternalName === 'Morguloth').Id }, 'endHour');
  r = R.apply(run, { t: 'fight' });
  eq('RC10 Stained Glass Window: thua Morguloth → bị phá', [r.run.phase.won, titles(r.run).includes('Stained Glass Window')], [false, false]);
  // RC10b: OnFightEnded không có nguồn là thẻ quái → Monster Tracker ("defeat a Gold-tier or higher Monster") không bao giờ chạy
  run = fresh('Karnok'); run.day = 4; run.level = 8; run.healthMax = 2000;
  const mt = inst(run, idOf('Monster Tracker'), 'hand', 0);
  Object.keys(C).filter(id => tagsOf(id).includes('Weapon') && C[id].Size === 'Small' && (C[id].Heroes || []).includes('Karnok') && C[id].Tiers && C[id].Tiers.Diamond
    && !/TTriggerOnFightEnded/.test(JSON.stringify(C[id].Abilities || {}))).slice(0, 6).forEach((id, i) => inst(run, id, 'hand', 2 + i, 'Diamond'));
  ctx = { run, events: [] }; R.ENCOUNTERS.combat.enter(ctx, { id: Object.values(E.combats).find(c => c.InternalName === 'Calico').Id }, 'endHour');
  r = R.apply(run, { t: 'fight' });
  eq('RC10b Monster Tracker: thắng Calico (quái bậc Gold) → +1 vật phẩm Loot', [r.run.phase.won, r.events.filter(v => v.type === 'gain').map(v => tagsOf(v.id).includes('Loot'))], [true, [true]]);

  // ENC D: bộ đếm trận (Custom_5/7/8) không đưa vào sim
  run = fresh('Vanessa'); run.wins = 2; run.pveWins = 1; g0 = run.gold; resolve(run, 'Sell the Rights (Dabora)');
  eq('ENC D Sell the Rights: thắng 2 PvP + 1 quái → +3 vàng', run.gold - g0, 3);

  // ENC B1 / B2: phần thưởng chung bịa
  run = fresh('Vanessa'); g0 = run.gold; ctx = { run, events: [] }; R.ENCOUNTERS.event.enter(ctx, { id: event("Farai's Rewards").Id }, 'endHour');
  eq("ENC B1 Farai's Rewards (không ability, không mô tả): không vàng / vật phẩm bịa", [run.gold - g0, gains(ctx).length], [0, 0]);
  run = fresh('Stelle'); ctx = { run, events: [] }; R.ENCOUNTERS.event.enter(ctx, { id: event('Praeteria').Id }, 'endHour');
  let offered = 0;
  for (let seed = 1; seed <= 60; seed++) { const x = R.newRun({ hero: 'Stelle', seed }); for (const d of [1, 2, 3]) { x.day = d; x.hour = 1; if (R.hourOptions(x).some(o => o.name === 'Praeteria')) offered++; } }
  eq('ENC B2 Praeteria cho Stelle (không bước nào): không lựa chọn bịa, 60 seed × 3 ngày không bày', [(run.phase.choices || []).filter(c => c.kind === 'generic').length, offered], [0, 0]);

  // ENC G: "Enchanted item" chia thẻ không có enchantment
  let plain = 0;
  for (let seed = 1; seed <= 30; seed++) {
    run = fresh('Karnok', seed); resolve(run, 'Haddy - Enchanted Item');
    (run.phase.picks || []).forEach(p => { if (!p.card.ench) plain++; });
  }
  eq('ENC G Haddy "Gain an Enchanted item" × 30 seed: thẻ nào cũng có enchantment', plain, 0);

  // ENC H: Cult Member Special ("a Legendary item") chia 0 thẻ
  run = fresh('Vanessa'); resolve(run, '[Shrouded Figure] Cult Member Legendary Chest');
  eq('ENC H Cult Member Special: bày 3 vật phẩm Legendary, chọn 1', [run.phase.kind, (run.phase.picks || []).length, (run.phase.picks || []).every(p => R.tpl(p.card.id).StartingTier === 'Legendary' && !R.isSkill(R.tpl(p.card.id))), run.phase.take], ['loot', 3, true, 1]);

  // ENC X: Multiply trên thuộc tính phần trăm gốc 0
  run = fresh('Dooley'); const core = inst(run, idOf('Companion Core'), 'hand', 3, 'Silver');
  resolve(run, 'Escalation Protocol');
  eq('ENC X Escalation Protocol: Core giảm hồi chiêu 5 %', core.mods.PercentCooldownReduction, 5);

  // ENC J: "Get 3 Loot items" là Deal 3 → lấy cả 3
  run = fresh('Vanessa'); resolve(run, '[Jungle Ruins] Grab the Loot');
  eq('ENC J Grab the Loot "Get 3 Loot items": bày 3, lấy cả 3', [(run.phase.picks || []).length, run.phase.take], [3, 3]);
}

// Đợt 9c (2026-10-23): lỗi luật người chơi thử báo ở D:\bazaar-ref\review9\play\P1..P3\ISSUES.md; báo cáo D:\bazaar-ref\review9\FIX-M2.md.
// Mỗi mã lỗi một khẳng định số viết tay.
function fix9c() {
  console.log('\n# Đợt 9c: lỗi luật từ người chơi thử');
  const C = globalThis.BZ_CARDS, E = globalThis.BZ_ENCOUNTERS;
  const idOf = n => Object.keys(C).find(id => R.title(C[id]) === n && !/DEBUG|Debug/.test(C[id].InternalName));
  const step = n => Object.values(E.steps).find(x => x.InternalName === n);
  const event = n => Object.values(E.events).find(x => x.InternalName === n);
  const titleOf = id => R.title(R.tpl(id)), tagsOf = id => (R.tpl(id).Tags || []).concat(R.tpl(id).HiddenTags || []);
  const uniq = a => [...new Set(a)].sort();
  const fresh = (hero, seed) => {
    const run = R.newRun({ hero, seed: seed || 5 });
    run.board.hand = []; run.board.stash = []; run.board.skills = []; run.phase = { kind: 'choose', options: [] }; run.day = 3; run.hour = 1;
    return run;
  };
  const resolve = (run, name) => { const ctx = { run, events: [] }; R.ENCOUNTERS.step.resolve(ctx, step(name), 'endHour'); return ctx; };
  const enterEv = (run, name) => { const ctx = { run, events: [] }; R.ENCOUNTERS.event.enter(ctx, { id: event(name).Id }, 'endHour'); return ctx; };
  const withOwned = (tier, fn) => { const o = R.ownedTier; R.ownedTier = () => tier; try { return fn(); } finally { R.ownedTier = o; } };
  const optOk = (run, name) => R.ENCOUNTERS.event.optionOk({ t: 'step', id: step(name).Id }, run);

  // P1-1: chữ không nêu bậc → bậc của sự kiện, không phải bậc gieo theo ngày
  let tiers = [];
  for (let seed = 1; seed <= 20; seed++) { const run = fresh('Vanessa', seed); run.day = 2; enterEv(run, 'Utility Box'); (run.phase.picks || []).forEach(p => tiers.push(p.card.tier)); }
  let tiers2 = [];
  for (let seed = 1; seed <= 10; seed++) { const run = fresh('Vanessa', seed); run.day = 7; enterEv(run, 'Mystery Box'); (run.phase.picks || []).forEach(p => tiers2.push(p.card.tier)); }
  eq('P1-1 Utility Box (Bạc) "Get a Small Tool" ngày 2 × 20 seed: chỉ Bạc; Mystery Box (Kim cương) ngày 7 × 10: chỉ Kim cương', [uniq(tiers), uniq(tiers2)], [['Silver'], ['Diamond']]);

  // P2-2: "Get 5 Bronze Chocolate Bars" (không có "-tier")
  tiers = [];
  for (let seed = 1; seed <= 6; seed++) { const run = fresh('Mak', seed); run.day = 6; const ctx = resolve(run, 'Basic Chocolate Bars (Eating Contest)'); ctx.events.filter(v => v.type === 'gain').forEach(v => tiers.push(v.tier)); }
  eq('P2-2 Basic Chocolate Bars ngày 6 × 6 seed: 30 thanh, đều Đồng', [tiers.length, uniq(tiers)], [30, ['Bronze']]);

  // P1-2: Finn's "Roast It" → Boar Roast + Cinders
  let run = fresh('Karnok'); inst(run, idOf('Wild Boar'), 'hand', 2, 'Gold');
  resolve(run, "[Finn's Big Bite] Roast It");
  eq('P1-2 Roast It với Wild Boar Vàng: thành Boar Roast Vàng + Cinders Vàng', R.allCards(run).map(c => [titleOf(c.id), c.tier]).sort(), [['Boar Roast', 'Gold'], ['Cinders', 'Gold']]);

  // P1-3: Supply Drop Kim cương khi đã có Cinders Đồng
  run = fresh('Vanessa'); run.day = 9;
  withOwned('Bronze', () => enterEv(run, 'Supply Drop (Diamond)'));
  eq('P1-3 Supply Drop (Kim cương), đã có bản Đồng: 3 thẻ đều Kim cương', run.phase.picks.map(p => [titleOf(p.card.id), p.card.tier]).sort(),
    [['Cinders', 'Diamond'], ['Extract', 'Diamond'], ['Sharpening Stone', 'Diamond']]);

  // P1-4 / P2-3 / P3-7: thẻ sinh ra không vừa chỗ → pha nhặt (bán bớt / bỏ qua), rồi đi tiếp chuỗi Gumball
  run = fresh('Vanessa'); run.level = 10;
  const big = Object.keys(C).find(id => C[id].Size === 'Large' && !R.isSkill(C[id]) && (C[id].Heroes || []).includes('Common') && !R.isJunk(C[id]));
  ['hand', 'stash'].forEach(sec => {
    while (R.firstFit(run, sec, 3) >= 0) inst(run, big, sec, R.firstFit(run, sec, 3));
    while (R.firstFit(run, sec, 1) >= 0) inst(run, idOf('Med Kit'), sec, R.firstFit(run, sec, 1));
  });
  let ctx = resolve(run, 'Get 5 Gumballs (10)');
  const lootPh = [run.phase.kind, (run.phase.picks || []).length, run.phase.take || 0, ctx.events.filter(v => v.type === 'lost').length];
  let r = R.apply(run, { t: 'leave' });
  eq('P1-4 Get 5 Gumballs, tay + kho đầy: pha nhặt 5 thẻ lấy cả 5, 0 mất im lặng; bỏ qua → còn chuỗi Gumball (2 lựa chọn)',
    [lootPh, r.run.phase.kind, (r.run.phase.choices || []).length], [['loot', 5, 5, 0], 'event', 2]);

  // P1-5: Wink +10 Prestige (chữ + hiệu ứng)
  run = fresh('Pygmalien'); run.prestige = 5; inst(run, idOf('Med Kit'), 'hand', 3);
  const wdesc = R.ENCOUNTERS.event.optionChoice({ t: 'step', id: step("Pay Wink's Toll").Id }, run, event('Wink')).desc;
  resolve(run, "Pay Wink's Toll");
  eq("P1-5 Pay Wink's Toll: uy tín 5 → 15, chữ có \"then gain 10 Prestige\"", [run.prestige, /then gain 10 Prestige$/.test(wdesc)], [15, true]);

  // P1-6: biến hình không ra đồ quái rơi / thỏi vàng
  let junk = 0, total = 0;
  const smalls = Object.keys(C).filter(id => C[id].Size === 'Small' && !R.isSkill(C[id]) && (C[id].Heroes || []).includes('Pygmalien') && C[id].StartingTier === 'Bronze' && !R.isJunk(C[id])).slice(0, 8);
  for (let seed = 1; seed <= 40; seed++) {
    run = fresh('Pygmalien', seed); smalls.forEach((id, i) => inst(run, id, i < 6 ? 'hand' : 'stash', i < 6 ? 2 + i : i - 6));
    resolve(run, "Pay Wink's Toll");
    R.allCards(run).forEach(c => { total++; if (R.isMonsterLoot(R.tpl(c.id))) junk++; });
  }
  eq("P1-6 Pay Wink's Toll × 40 seed × 8 món: 0 Bar of Gold / Chunk of Gold / Pelt", [total, junk], [320, 0]);

  // P1-7: sự kiện nháp "Speed" không bày
  const seen = new Set(), ids = [event("Tok's Clocks (Charged Up More)").Id, event('Run a Race').Id];
  for (let seed = 1; seed <= 150; seed++) { const x = R.newRun({ hero: 'Vanessa', seed }); for (const d of [1, 2, 3, 4]) { x.day = d; x.hour = 1; R.hourOptions(x).forEach(o => seen.add(o.id)); } }
  eq("P1-7 150 seed × ngày 1-4: không bày Tok's Clocks (Charged Up More), Run a Race; lựa chọn Charged Up bị ẩn",
    [ids.map(id => seen.has(id)), optOk(fresh('Vanessa'), 'Charged Up')], [[false, false], false]);

  // P1-8: rương Bạc khi đã có bản Vàng
  tiers = [];
  for (let seed = 1; seed <= 10; seed++) {
    run = fresh('Vanessa', seed); run.day = 10; ctx = { run, events: [] };
    withOwned('Gold', () => R.enterChest(ctx, R.chestFor(7), 'endHour'));
    run.phase.picks.forEach(p => tiers.push(p.card.tier));
  }
  eq('P1-8 rương 7 thắng (Bạc), đã có bản Vàng × 10 seed: 30 thẻ đều Bạc', [tiers.length, uniq(tiers)], [30, ['Silver']]);

  // P1-9 / P2-5: lựa chọn "leftmost X item" / "Your items gain" không có đích thì ẩn
  const poison = Object.keys(C).find(id => C[id].Size === 'Small' && !R.isSkill(C[id]) && (C[id].HiddenTags || []).includes('Poison') && (C[id].Heroes || []).includes('Vanessa') && !R.isJunk(C[id]));
  const dunes = n => Object.values(E.steps).find(x => E.events[event('Artisan Dunes').Id].Steps.includes(x.Id) && x.Title === n).InternalName;
  run = fresh('Vanessa'); inst(run, poison, 'stash', 0); inst(run, idOf('Med Kit'), 'hand', 3);
  const noPoisonInHand = ['Upgrade (Botul)', 'Enchant (Botul)', 'New Coating (Botul)', dunes('Apprentice Banehand')].map(n => optOk(run, n));
  run = fresh('Vanessa'); inst(run, idOf('Med Kit'), 'hand', 3);
  const noPoison = optOk(run, dunes('Apprentice Banehand'));
  run = fresh('Vanessa'); inst(run, poison, 'hand', 3);
  eq('P1-9 Botul: Poison chỉ ở kho → ẩn Upgrade/Enchant (đích ở tay), giữ New Coating + Banehand (cả kho); không Poison → ẩn Banehand (P2-5); Poison ở tay → hiện',
    [noPoisonInHand, noPoison, optOk(run, 'Upgrade (Botul)')], [[false, false, true, true], false, true]);

  // P1-11: chữ "Your items gain N" kèm tên chỉ số
  run = fresh('Vanessa');
  eq('P1-11 chữ: New Coating "gain 3 Poison", Purify "gain 30 Heal. / gain 3 Regen", Weaponsmith "gain 5 Damage"',
    ['New Coating (Botul)', 'Purify (Aldric)', dunes('Apprentice Weaponsmith')].map(n => R.encText(run, step(n), step(n).Desc)),
    ['Your items gain 3 Poison', 'Your items gain 30 Heal.\nYour items gain 3 Regen', 'Your items gain 5 Damage']);

  // P1-12: món "giảm giá" phải rẻ hơn
  let disc = 0, flat = 0;
  for (let seed = 1; seed <= 200; seed++) {
    run = R.newRun({ hero: 'Vanessa', seed }); run.day = 1;
    R.ENCOUNTERS.merchant.dealStock(run, event('Ande')).forEach(s => { if (s.discount) { disc++; if (s.price >= R.price(s.card, s.card.tier).buy) flat++; } });
  }
  eq('P1-12 Ande ngày 1 × 200 seed: có món giảm giá, không món "giảm" nào giữ nguyên giá', [disc > 0, flat], [true, 0]);

  // P1-10 / P3-4 (phần reducer): pha fightResult mang phần thưởng quái treo để tấm "Phần thưởng" không lộ kết quả khi đang phát lại
  run = fresh('Stelle'); run.day = 1;
  const kyver = Object.values(E.combats).find(x => x.InternalName === 'Kyver Drone');
  R.ENCOUNTERS.combat.enter({ run, events: [] }, { id: kyver.Id }, 'endHour');
  r = R.apply(run, { t: 'fight' });
  eq('P1-10 thua Kyver Drone với bàn trống: phase.opponent mang phần thưởng treo 2 vàng 2 XP (Version 2.5.0 Bronze, WIKI2 M-P1) và bậc Bronze (phase.rewards là phần thua)',
    [r.run.phase.kind, r.run.phase.won, r.run.phase.opponent.rewards, r.run.phase.opponent.tier], ['fightResult', false, { gold: 2, xp: 2 }, 'Bronze']);

  // P2-10 / P3-8: bậc thẻ trận khớp vàng thưởng
  const cb = n => { const c = Object.values(E.combats).find(x => x.InternalName === n); return [c.StartingTier, c.Gold]; };
  eq('P2-10 Bloodreef Raider Bạc 3 vàng, (D4 Bronze) Đồng 2 vàng, Ferros Khan (Bronze) cấp 10 Vàng 4 vàng',
    ['Bloodreef Raider', 'Bloodreef Raider (D4 Bronze)', 'Ferros Khan (Bronze)'].map(cb), [['Silver', 3], ['Bronze', 2], ['Gold', 4]]);

  // P2-11: Chronos "Sells Haste items" không bày món không Haste
  const chron = new Set();
  R.HEROES_PLAYABLE.forEach(hero => { for (let seed = 1; seed <= 40; seed++) { run = R.newRun({ hero, seed }); run.day = 6; R.ENCOUNTERS.merchant.dealStock(run, event('Chronos')).forEach(s => chron.add(titleOf(s.card.id))); } });
  eq("P2-11 Chronos × 7 hero × 40 seed: không Refractor / Dooley's Scarf / Leather Jacket", ['Refractor', "Dooley's Scarf", 'Leather Jacket'].filter(n => chron.has(n)), []);

  // P3-9: sạp khoá bậc (Goldie, Luxe) bày đúng bậc dù đã có bản bậc khác
  const shopTiers = name => { const out = []; for (let seed = 1; seed <= 10; seed++) { run = R.newRun({ hero: 'Jules', seed }); run.day = 9; withOwned('Bronze', () => R.ENCOUNTERS.merchant.dealStock(run, event(name))).forEach(s => out.push(s.card.tier)); } return uniq(out); };
  eq('P3-9 đã có bản Đồng mọi món: Goldie chỉ Vàng, Luxe chỉ Kim cương', [shopTiers('Goldie'), shopTiers('Luxe')], [['Gold'], ['Diamond']]);

  // P3-13: bóng PvP không mang thẻ ẩn (không có art)
  const G0 = globalThis.BZ_GHOSTS;
  globalThis.BZ_GHOSTS = { v: 1, byDay: { 1: [{ name: 'g', hero: 'Mak', level: 1, day: 1, cards: [
    { id: idOf('Plasma Whip'), tier: 'Bronze', socket: 0, size: 1, section: 'hand' }, { id: idOf('Med Kit'), tier: 'Bronze', socket: 1, size: 1, section: 'hand' }] }] } };
  run = fresh('Vanessa'); run.day = 1;
  const gb = R.ENCOUNTERS.combat.datasetGhost(run).board.cards.map(c => titleOf(c.id));
  globalThis.BZ_GHOSTS = G0;
  eq('P3-13 bóng có Plasma Whip (HIDDEN_CARDS): chỉ còn Med Kit', gb, ['Med Kit']);

  // P2-1 / P3-1 (sửa trong pool.js trước đợt này): Maximus có hàng cho mọi hero, đúng chủ đề
  const want = ['Health', 'Shield', 'Weapon', 'Damage', 'Cooldown'], maxi = { empty: [], off: [] };
  ['Vanessa', 'Pygmalien', 'Dooley', 'Mak', 'Stelle', 'Jules', 'Karnok'].forEach(hero => {
    for (const day of [1, 2, 4, 8]) {
      run = R.newRun({ hero, seed: day * 3 }); run.day = day;
      const st = R.ENCOUNTERS.merchant.dealStock(run, event('Maximus'));
      if (!st.length) maxi.empty.push(hero + day);
      st.forEach(s => { if (!want.some(t => tagsOf(s.card.id).includes(t))) maxi.off.push(titleOf(s.card.id)); });
    }
  });
  eq('P2-1 Maximus × 7 hero × ngày 1/2/4/8: không sạp rỗng, mọi món mang Health/Shield/Weapon/Damage/Cooldown', maxi, { empty: [], off: [] });
}

// ---------- Đợt 9d: luật và số theo wiki (D:\bazaar-ref\review9\wiki\WIKI2.md; bản chép wiki D:\bazaar-ref\wiki2\pages) ----------
// Mỗi khối chạy trong try: mã cũ thiếu hàm thì khối đó báo FAIL thay vì làm sập cả phần (để chạy được trên bản cũ mà so).
function fix9d() {
  console.log('\n# Đợt 9d: luật và số theo wiki (WIKI2)');
  const C = globalThis.BZ_CARDS, E = globalThis.BZ_ENCOUNTERS;
  const ev = n => Object.values(E.events).find(x => x.InternalName === n) || Object.values(E.events).find(x => x.Title === n);
  const stepN = n => Object.values(E.steps).find(x => x.InternalName === n);
  const titleOf = id => R.title(R.tpl(id));
  const uniq = a => [...new Set(a)].sort();
  const block = (name, fn) => { try { fn(); } catch (e) { check(name + ' (lỗi: ' + String(e && e.message).slice(0, 120) + ')', false, String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } };
  const fresh = (hero, seed, day) => { const x = R.newRun({ hero: hero || 'Vanessa', seed: seed || 5 }); x.board.hand = []; x.board.stash = []; x.board.skills = []; x.day = day || 3; x.hour = 1; x.phase = { kind: 'choose', options: [] }; return x; };
  const enterEv = (run, name) => { const ctx = { run, events: [] }; R.ENCOUNTERS.event.enter(ctx, { id: ev(name).Id }, 'endHour'); return ctx; };
  const seenIn = (names, days, seeds, hero) => { // số lần mỗi tên được bày ở giờ tự do
    const out = {}; names.forEach(n => { out[n] = 0; });
    days.forEach(d => { for (let sd = 1; sd <= seeds; sd++) { const x = R.newRun({ hero: hero || 'Mak', seed: sd }); x.day = d; x.hour = 1; x.prev = [];
      R.hourOptions(x).forEach(o => { const e = E.events[o.id] || E.pedestals[o.id]; const k = e && (names.indexOf(e.InternalName) >= 0 ? e.InternalName : names.indexOf(e.Title) >= 0 ? e.Title : null); if (k) out[k]++; }); } });
    return out;
  };

  // R1 + M-P1 + R13: bot thắng mọi trận quái (chọn ô Đồng), giờ tự do vào thương nhân rồi rời → đầu ngày 10 đúng cấp 10
  block('R1 XP', () => {
    const realRun = BZ.run; // trận nào cũng thắng: BZSim.run giả trả winner 0 (chỉ đo XP, không đo sức mạnh bàn)
    BZ.run = () => ({ winner: 0, endMs: 1000, frames: [], players: [] });
    try {
    let run = R.newRun({ hero: 'Vanessa', seed: 11 }), n = 0;
    const xp = {}, startOf = {};
    const r0 = R.apply(run, { t: 'choose', i: run.phase.choices.findIndex(c => c.key === 'income') });
    r0.events.forEach(e => { if (e.type === 'xp') xp[e.why] = (xp[e.why] || 0) + e.delta; });
    run = r0.run;
    while (run.phase.kind !== 'end' && run.day < 10 && n++ < 3000) {
      const ph = run.phase, L = R.legal(run);
      let cmd = null;
      if (ph.kind === 'choose') { const mi = ph.options.findIndex(o => o.type === 'merchant'); cmd = { t: 'pick', i: run.hour === R.TUNING.PVE_HOUR ? 0 : (mi >= 0 ? mi : 0) }; }
      else if (ph.kind === 'fight') cmd = { t: 'fight' };
      else if (L.some(c => c.t === 'leave')) cmd = { t: 'leave' };
      else if (L.some(c => c.t === 'next')) cmd = { t: 'next' };
      else if (L.some(c => c.t === 'choose')) cmd = L.find(c => c.t === 'choose');
      else if (L.some(c => c.t === 'back')) cmd = { t: 'back' };
      const r = R.apply(run, cmd);
      if (!r.ok) throw new Error('lệnh ' + JSON.stringify(cmd) + ' bị từ chối ở ' + ph.kind + ': ' + r.events[0].reason);
      r.events.forEach(e => { if (e.type === 'xp') xp[e.why] = (xp[e.why] || 0) + e.delta; });
      if (r.run.day !== run.day) startOf[r.run.day] = { level: r.run.level, xp: r.run.xp };
      run = r.run;
    }
    eq('R1 (wiki Day "six Hours" + Level Up "8 XP" + Version 2.5.0 quái Đồng 2 XP; không XP khi chọn gặp gỡ): bot thắng mọi trận quái Đồng → đầu ngày 2 cấp 2, đầu ngày 10 cấp 10 / 72 XP',
      [startOf[2] && startOf[2].level, startOf[10] && startOf[10].level, startOf[10] && startOf[10].xp], [2, 10, 72]);
    eq('R1: XP theo nguồn sau 9 ngày = 54 giờ (6 x 9, mở màn là giờ 0) + 18 quái (9 x 2), không "select"', xp, { hour: 54, combat: 18 });
    } finally { BZ.run = realRun; }
  });
  // R2: máu theo cấp
  block('R2 máu', () => {
    const run = R.newRun({ hero: 'Vanessa', seed: 42 }); run.xp = 7; run.phase = merchantPhase([]);
    const r = R.apply(run, { t: 'leave' });
    eq('R2 (Version 2.5.0 + clip wUzq6Q4u9Jc): lên cấp 2 → máu tối đa 350; bảng cấp 1..10 = 300/350/450/600/800/1050/1350/1700/2100/2550',
      [r.run.level, r.run.healthMax, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(R.hpAtLevel)], [2, 350, [300, 350, 450, 600, 800, 1050, 1350, 1700, 2100, 2550]]);
  });
  // E1: lựa chọn trả vàng
  block('E1 Eating Contest', () => {
    let run = fresh('Mak', 3, 4); run.gold = 4;
    enterEv(run, 'Eating Contest');
    const by = n => run.phase.choices.findIndex(c => c.name === n);
    const costs = ['Basic Chocolate Bars', 'Deluxe Chocolate Bars', 'Premium Chocolate Bars'].map(n => (run.phase.choices[by(n)] || {}).cost);
    const legal = R.legal(run).filter(c => c.t === 'choose').map(c => run.phase.choices[c.i].name).sort();
    const rej = R.apply(run, { t: 'choose', i: by('Deluxe Chocolate Bars') });
    run.gold = 12;
    const ok = R.apply(run, { t: 'choose', i: by('Deluxe Chocolate Bars') });
    const bars = ok.events.filter(e => e.type === 'gain').map(e => titleOf(e.id) + '/' + e.tier);
    eq('E1 Eating Contest (wiki: Basic miễn phí, (5 gold) Deluxe, (10 gold) Premium): giá 0/5/10; 4 vàng chỉ chọn được Basic; Deluxe bị từ chối khi thiếu; 12 vàng chọn Deluxe → còn 7 vàng, 5 thanh Bạc',
      [costs, legal, rej.ok, ok.ok, ok.run.gold, bars.length, uniq(bars)], [[0, 5, 10], ['Basic Chocolate Bars'], false, true, 7, 5, ['Chocolate Bar/Silver']]);
  });
  block('E1 Form/Aldric/Botul/D\'flek/Flambe/Mad Maddie/Gumball/Seminar/Artisan', () => {
    const run = fresh('Vanessa', 1, 8), cost = (evName, stepName) => R.ENCOUNTERS.event.optionChoice({ t: 'step', id: stepN(stepName).Id }, run, ev(evName)).cost;
    eq('E1 Form (wiki: Exploit / 5 Sharpen Weapon / 10 Upgrade / 20 Engrave)', ['Exploit (Form)', 'Sharpen Weapon (Form)', 'Upgrade (Form)', 'Enchant (Form)'].map(s => cost('Form', s)), [0, 5, 10, 20]);
    eq('E1 Aldric / Botul / D\'flek / Flambe / Mad Maddie: Exploit 0, nâng cấp chung 5, Upgrade 10, Enchant 20',
      [['Aldric', 'Exploit', 'Purify'], ['Botul', 'Exploit', 'New Coating'], ["D'flek", 'Exploit', 'Reinforce'], ['Flambe', 'Exploit', 'Temper'], ['Mad Maddie', 'Exploit', 'Extended Magazine']]
        .map(([e, a, b]) => [a, b, 'Upgrade', 'Enchant'].map(s => cost(e, s + ' (' + e + ')'))), [[0, 5, 10, 20], [0, 5, 10, 20], [0, 5, 10, 20], [0, 5, 10, 20], [0, 5, 10, 20]]);
    eq('E1 Gumball Machine Event "1 gold per Gumball": 1 viên 1 vàng, gói 5 viên 5 vàng; Economic Seminar Premium 4; Artisan "Find Better Craftsman" 5',
      [cost('Gumball Machine', 'Get a Gumball (10)'), cost('Gumball Machine', 'Get 5 Gumballs (10)'), cost('Economic Seminar', 'The Financial District - Economic Seminar - Premium Pass'), cost('Artisan Dunes', 'Find Better Craftsman')], [1, 5, 4, 5]);
    const g = fresh('Vanessa', 2, 9); g.gold = 3;
    g.phase = { kind: 'event', eventId: ev('Gumball Machine').Id, choices: [R.ENCOUNTERS.event.optionChoice({ t: 'step', id: stepN('Get a Gumball (10)').Id }, g, ev('Gumball Machine'))], canExit: true, after: 'endHour' };
    const r = R.apply(g, { t: 'choose', i: 0 });
    eq('E1 + E7 Gumball (ngày 9, 3 vàng): trả 1 vàng → còn 2, nhận 1 Gumball bậc Đồng ("All Gumballs are of Bronze tier"), không XP', [r.ok, r.run.gold, r.events.filter(e => e.type === 'gain').map(e => e.tier), r.events.filter(e => e.type === 'xp').length], [true, 2, ['Bronze'], 0]);
  });
  // S1 / R7: mở màn
  block('S1/R7 mở màn', () => {
    let bad = [], n = 0, gold = [], skillTiers = [], skillN = [];
    R.HEROES_PLAYABLE.forEach(hero => { for (let sd = 1; sd <= 30; sd++) {
      const run = R.newRun({ hero, seed: sd }), it = run.phase.choices.find(c => c.key === 'item'), sk = run.phase.choices.find(c => c.key === 'skill');
      (it.picks || [it.card]).forEach(p => { n++; const t = R.tpl(p.id); if (!p.ench || p.ench === 'Golden' || p.ench === 'Radiant' || t.Size !== 'Small' || p.tier !== 'Bronze') bad.push(titleOf(p.id) + '/' + p.ench); });
      if (sd === 1) { const r = R.apply(run, { t: 'choose', i: run.phase.choices.indexOf(it) }); gold.push(r.run.gold - run.gold); }
      skillN.push((sk.picks || [sk.card]).length); (sk.picks || [sk.card]).forEach(p => skillTiers.push(p.tier));
    } });
    eq('S1 (wiki Start of Run "Choose an Enchanted (Non-Golden, Non-Radiant) Item (Choose 1 from 3) and + 6 Gold"): 7 hero x 30 seed = 630 món Small Bronze yểm bùa, 0 Golden/Radiant; chọn → +6 vàng',
      [n, bad.slice(0, 5), uniq(gold)], [630, [], [6]]);
    eq('R7 ("Choose a Gold-tier Skill (Choose 1 from 3)"): mọi hero 3 kỹ năng, đều bậc Gold', [uniq(skillN), uniq(skillTiers)], [[3], ['Gold']]);
  });
  // R10: món yểm bùa ở thương nhân giá gấp đôi
  block('R10 Serafina', () => {
    let nE = 0, bad = 0;
    for (let sd = 1; sd <= 60; sd++) { const run = R.newRun({ hero: 'Vanessa', seed: sd }); run.day = 6;
      R.ENCOUNTERS.merchant.dealStock(run, ev('Serafina')).forEach(s => { if (!s.card.ench) return; nE++; const b = 2 * R.price(s.card, s.card.tier).buy; if (s.price !== (s.discount ? Math.floor(b * 0.75) : b)) bad++; }); }
    eq('R10 (wiki Items: enchanted từ Merchants "double the price"): Serafina 60 seed, mọi món yểm bùa giá = 2 x giá gốc (x0,75 nếu giảm)', [nE > 100, bad], [true, 0]);
  });
  // P2 / P3 / P4 / P5: quái theo ngày
  block('P2-P5 quái', () => {
    const Cb = R.ENCOUNTERS.combat, ents = d => (Cb.dayEntries ? Cb.dayEntries(d) : Cb.dayCombats(d).map(c => ({ c, tier: c.StartingTier, hp: null })));
    const find = (d, n) => ents(d).find(x => x.c.Title === n || x.c.InternalName === n);
    const hpOf = x => x && (x.hp || globalThis.BZ_MONSTERS.find(m => m.Id === x.c.Monster).Player.Attributes.HealthMax);
    eq('P2 bốn tên wiki khác tên dữ liệu có mặt: Tempest Flamedancer (d3) = Tempest Bravo, Shock Trooper (d7) = Annex Trooper, Death Knight Reaper (d9, Legendary) = Void Knight, Veteran Octopus (d10, 8888 máu) = Eight Arm Davvy',
      [[3, 'Tempest Bravo'], [7, 'Annex Trooper'], [9, 'Void Knight'], [10, 'Eight Arm Davvy']].map(([d, n]) => { const x = find(d, n) || ents(d).find(y => /Eight Arm Davvy/.test(y.c.InternalName) && n === 'Eight Arm Davvy'); return x ? [x.tier, hpOf(x)] : null; }),
      [['Bronze', 300], ['Gold', 1925], ['Legendary', 3675], ['Legendary', 8888]]);
    eq('P3/P4 (wiki Monsters, bậc theo ngày + máu trang quái): d1 Haunted Kimono Đồng 100; d2 Giant Mosquito Đồng 200; d2 Boarrior Vàng 400; d6 Dire Mosquito Đồng 900; d7 Thug Bạc 1550; d7 Ghost Pepper Kim cương 2200; d9 Yerdan Đồng 1925; d1 Kyver Drone 100',
      [[1, 'Haunted Kimono'], [2, 'Giant Mosquito'], [2, 'Boarrior'], [6, 'Dire Mosquito'], [7, 'Thug'], [7, 'Ghost Pepper'], [9, 'Yerdan'], [1, 'Kyver Drone']].map(([d, n]) => { const x = find(d, n); return x ? [x.tier, hpOf(x)] : null; }),
      [['Bronze', 100], ['Bronze', 200], ['Gold', 400], ['Bronze', 900], ['Silver', 1550], ['Diamond', 2200], ['Bronze', 1925], ['Bronze', 100]]);
    const all = []; for (let d = 1; d <= 12; d++) ents(d).forEach(x => all.push(x.c.InternalName));
    eq('P5: "[DISABLED] Joyful Jack" không ở danh sách ngày nào', all.filter(n => /DISABLED/.test(n)), []);
    let leg9 = 0; for (let sd = 1; sd <= 200; sd++) { const x = R.newRun({ hero: 'Mak', seed: sd }); x.day = 9; if (Cb.options(x).some(o => o.tier === 'Legendary')) leg9++; }
    check('P2: ngày 9 có ô Legendary (Void Knight) trong 200 seed: ' + leg9, leg9 > 0);
  });
  block('M-P1 thưởng quái', () => {
    const got = {};
    for (let d = 1; d <= 10; d++) for (let sd = 1; sd <= 30; sd++) { const x = R.newRun({ hero: 'Jules', seed: sd }); x.day = d; R.ENCOUNTERS.combat.options(x).forEach(o => { got[o.tier] = o.gold + '/' + o.xp; }); }
    eq('M-P1 (Version 2.5.0): vàng/XP thắng quái Đồng 2/2, Bạc 3/2, Vàng 4/2, Kim cương 5/3, Huyền thoại 6/3', got, { Bronze: '2/2', Silver: '3/2', Gold: '4/2', Diamond: '5/3', Legendary: '6/3' });
  });
  // E3 Mountain Pass
  block('E3 Mountain Pass', () => {
    const cnt = { fightSameDay: 0, fightNextDay: 0, good: 0, bad: 0 }, kinds = {};
    for (let sd = 1; sd <= 2000; sd++) {
      const run = fresh('Vanessa', sd, 5), ctx = enterEv(run, 'Mountain Pass');
      const o = (run.log.filter(l => l.t === 'mountainPass')[0] || {}).outcome || 'none';
      if (/^fight/.test(o)) { cnt[o]++; if (run.phase.kind !== 'fight') cnt.noFight = (cnt.noFight || 0) + 1; } else if (/^skill:/.test(o)) cnt.bad++; else if (o !== 'none') cnt.good++;
      kinds[o] = 1;
    }
    const pct = k => Math.round(cnt[k] / 20);
    eq('E3 (Version 2.0.0 Mountain Pass 25/25/40/10): 2000 lần, % đấu cùng ngày / ngày sau / tốt / xấu (±4)', [St0().MOUNTAIN_ODDS, [pct('fightSameDay'), pct('fightNextDay'), pct('good'), pct('bad')].map((v, i) => Math.abs(v - [25, 25, 40, 10][i]) <= 4), cnt.noFight || 0],
      [[25, 25, 40, 10], [true, true, true, true], 0]);
    eq('E3: đủ 6 kết quả tốt + 2 kỹ năng xấu', ['loot', 'regen', 'tip', 'invest', 'routine', 'sea', 'skill:Valley Fever', 'skill:Insect Bite'].filter(k => !kinds[k]), []);
  });
  // R15 / E5 / E2 / E6 / E8 / E13 / E14
  block('R15 Futura', () => {
    const ids = []; for (let sd = 1; sd <= 20; sd++) { const x = fresh('Pygmalien', sd, 4); x.fatesPending = true; const ctx = { run: x, events: [] }; R.enterFates(ctx); ids.push(x.phase.choices.map(c => c.id).join(',')); }
    eq('R15 (wiki Futura: Bounty, Crossroads, Legacy): 20 seed đều đúng ba lựa chọn đó', uniq(ids), ['bounty,crossroads,legacy']);
  });
  block('E5 Statia / E11 Thieves Guild', () => {
    eq('E5 / E11: Statia và Thieves Guild không vào giờ tự do (ngày 8-10 x 300 seed)', seenIn(['Statia', 'Thieves Guild'], [8, 9, 10], 300), { Statia: 0, 'Thieves Guild': 0 });
  });
  block('E2 Haddy', () => {
    const prizes = {}, first = [];
    for (let sd = 1; sd <= 300; sd++) {
      const run = fresh('Stelle', sd, 9); enterEv(run, 'Haddy'); first.push(run.phase.choices.map(c => c.name).join(','));
      const r = R.apply(run, { t: 'choose', i: 0 });
      (r.run.phase.choices || []).forEach(c => { prizes[E.steps[c.id] ? E.steps[c.id].InternalName : c.name] = 1; });
    }
    eq('E2 (wiki Haddy "One prize is randomly selected", 6 giải gồm Magician\'s Top Hat): chỉ bày "Spin the Wheel"; quay ra 1 giải, đủ 6 giải trong 300 seed',
      [uniq(first), Object.keys(prizes).sort().length, !!prizes["Haddy - Haddy's Hat Reward"]], [['Spin the Wheel'], 6, true]);
    const s = seenIn(['Haddy'], [6, 7], 400, 'Stelle').Haddy, s8 = seenIn(['Haddy'], [8, 9, 10], 400, 'Stelle').Haddy;
    eq('E2 Haddy "Day 8+": ngày 6-7 không bày, ngày 8-10 có', [s, s8 > 0], [0, true]);
  });
  block('E6 Study', () => {
    const run = fresh('Mak', 1, 4), sx = enterEv(run, 'Study (Default Option)').events.filter(e => e.type === 'xp' && e.why !== 'hour').reduce((a, e) => a + e.delta, 0);
    const day3 = seenIn(['Study (Default Option)'], [3], 600)['Study (Default Option)'];
    eq('E6 (wiki Study "Gain 1 Additional XP", 2.5.0 không ra ngày 3): Study cho đúng 1 XP (ngoài 1 XP của giờ), ngày 3 x 600 seed 0 lần', [sx, day3], [1, 0]);
  });
  block('E8 Relax', () => {
    const run = fresh('Karnok', 1, 5); run.level = 5; enterEv(run, 'Rest');
    const ctx = { run, events: [] }; run.hour = 2; R.ENCOUNTERS.combat.enter(ctx, { id: Object.values(E.combats).find(c => c.InternalName === 'Kyver Drone').Id }, 'endHour');
    const b = R.fightBoards(run), r = R.apply(run, { t: 'fight' });
    eq('E8 (wiki Relax "Start your next fight with 100 Shield per Level"): cấp 5 → trận kế mở với 500 khiên, xong trận thì hết', [b[0].attrs.Shield, r.run.nextFightShield], [500, 0]);
  });
  block('E13/E14 ngày', () => {
    const s = seenIn(['Armory', 'Battlefield', 'Snack Time', 'Bladeborn Badlands', 'Burning Caldera'], [1], 300, 'Vanessa');
    const s10 = seenIn(['Armory', 'Battlefield', 'Snack Time', 'Bladeborn Badlands', 'Burning Caldera'], [7, 10], 300, 'Vanessa');
    const s9 = seenIn(['Bladeborn Badlands', 'Burning Caldera', 'Celestial Conduit', "Guardian's Gorge", 'Murkwood Bayou'], [5, 6, 7, 8, 9], 300, 'Vanessa');
    eq('E13 (Category_Event: Armory Bạc / Snack Time Bạc / Battlefield Đồng "Day 1+"): ngày 1 có Armory + Snack Time + Battlefield; ngày 7 + 10 vẫn có cả ba',
      [s.Armory > 0, s['Snack Time'] > 0, s.Battlefield > 0, s10.Armory > 0, s10['Snack Time'] > 0, s10.Battlefield > 0], [true, true, true, true, true, true]);
    eq('E14 (bệ yểm bùa "Day 10+"): ngày 5-9 x 300 seed 0 lần; ngày 10 có', [Object.values(s9).reduce((a, b) => a + b, 0), s10['Bladeborn Badlands'] + s10['Burning Caldera'] > 0], [0, true]);
  });
  // R6: đống đồ của sự kiện theo bảng bậc của thương nhân
  block('R6 bậc đống đồ', () => {
    const t = {}; let n = 0;
    for (let sd = 1; sd <= 300; sd++) { const run = fresh('Vanessa', sd, 10); enterEv(run, 'Armory'); (run.phase.picks || []).forEach(p => { n++; t[p.card.tier] = (t[p.card.tier] || 0) + 1; }); }
    const dia = Math.round(100 * (t.Diamond || 0) / n);
    check('R6 (một bảng bậc theo ngày, bazaardb ngày 10 = Kim cương 9,9 %): Armory ngày 10 x 300 seed, Kim cương ' + dia + ' % (cũ 76 %) ≤ 20 %', n > 200 && dia <= 20, t);
  });
  // M1 / M2 / M3 / M7: thương nhân
  block('M1-M3 thương nhân', () => {
    const sold = (merchant, hero, deals, day) => { const out = {}; for (let sd = 1; sd <= deals; sd++) { const run = R.newRun({ hero, seed: sd }); run.day = day; R.ENCOUNTERS.merchant.dealStock(run, ev(merchant)).forEach(s => { const n = titleOf(s.card.id); out[n] = (out[n] || 0) + 1; }); } return out; };
    const cur = sold('Curio', 'Vanessa', 100, 3);
    check('M1 (wiki Curio "Sells Bronze-tier junk items", Sharpening Stone "can be bought via the merchant Curio"): Curio 100 lần bày có Sharpening Stone (' + (cur['Sharpening Stone'] || 0) + ') và Bar of Gold (' + (cur['Bar of Gold'] || 0) + ')', cur['Sharpening Stone'] > 0 && cur['Bar of Gold'] > 0, Object.keys(cur).slice(0, 20));
    const monNames = new Set((globalThis.BZ_SHOPS.monsterItems || []).map(titleOf));
    const bk = {}; R.HEROES_PLAYABLE.forEach(h => { const s = sold('Barkun', h, 300, 4); for (const n in s) if (monNames.has(n) || R.isMonsterLoot(R.tpl(Object.keys(C).find(id => titleOf(id) === n)))) bk[n] = (bk[n] || 0) + s[n]; });
    eq('M2 (wiki Junk Items "only ... Monster encounters or ... Curio"; review: Barkun 19,2 % đồ quái): Barkun 7 hero x 300 lần bày, 0 món wiki collection Monster/Junk; monsterItems có ≥ 100 thẻ', [bk, monNames.size >= 100], [{}, true]);
    const ai = sold('Aila', 'Vanessa', 300, 5);
    eq('M2: Aila 300 lần bày không có Old Sword / Fang / Claws', ['Old Sword', 'Fang', 'Claws'].filter(n => ai[n]), []);
    const mk = sold('Mak (Hero Merchant)', 'Vanessa', 300, 5);
    eq('M3 (wiki Catalyst: Loot, collection Monster/Junk): Mak Hero Merchant 300 lần bày không có Catalyst', mk.Catalyst || 0, 0);
    eq('M7 (Version 0.1.3 "Pol ... no longer spawns on Day 3 and 4"): Pol ngày 4 x 400 seed 0 lần', seenIn(['Pol'], [4], 400, 'Dooley').Pol, 0);
  });
  // E9 Pearl's Dig Site / E10 Epic Battle / E12 Finn's + Treasure Chest
  block('E9 Pearl', () => {
    const run = fresh('Vanessa', 4, 6); run.gold = 10; enterEv(run, "Pearl's Dig Site");
    const p0 = [run.phase.rerolls, run.phase.rerollCost];
    const r1 = R.apply(run, { t: 'reroll' }), r2 = R.apply(r1.run, { t: 'reroll' });
    eq("E9 (wiki Pearl's Dig Site: reroll vô hạn, 1 vàng rồi +1): reroll 999 giá 1; sau hai lần trừ 1 + 2 = 3 vàng", [p0, r2.ok, r2.run.gold], [[999, 1], true, 7]);
    let loot = 0, other = 0;
    for (let sd = 1; sd <= 200; sd++) { const x = fresh('Vanessa', sd, 6); enterEv(x, "Pearl's Dig Site"); (x.phase.picks || []).forEach(p => { const t = R.tpl(p.card.id); if (R.isMonsterLoot(t)) loot++; if ((t.Heroes || []).indexOf('Vanessa') < 0 && (t.Heroes || []).indexOf('Common') < 0) other++; }); }
    check("E9: 200 lần đào có đồ của hero khác (" + other + ") và đồ quái Loot (" + loot + ")", other > 0 && loot > 0);
  });
  block('E12 Finn / Treasure Chest', () => {
    const run = fresh('Pygmalien', 2, 3); run.healthMax = 300; enterEv(run, "Finn's Big Bite");
    const names = run.phase.choices.map(c => c.name);
    const r = R.apply(run, { t: 'choose', i: names.indexOf('Vitality Stew') });
    eq("E12 (wiki Finn's Big Bite): bày Guardian's Gravy Plate / Restorative Risotto / Vitality Stew; Stew → máu 300 → 315, Regen +5",
      [['Guardian\'s Gravy Plate', 'Restorative Risotto', 'Vitality Stew'].every(n => names.indexOf(n) >= 0), r.ok && r.run.healthMax, r.ok && r.run.pattrs.HealthRegen], [true, 315, 5]);
    const tc = seenIn(['Treasure Chest', "Finn's Big Bite"], [1, 2], 400, 'Vanessa');
    eq('E12: Treasure Chest ("Day 1+") và Finn\'s Big Bite được bày ở ngày 1-2', [tc['Treasure Chest'] > 0, tc["Finn's Big Bite"] > 0], [true, true]);
    const esName = 'The Financial District - Economic Seminar';
    const es = seenIn([esName], [3, 4, 5], 300, 'Pygmalien')[esName], es2 = seenIn([esName], [6], 300, 'Pygmalien')[esName];
    eq('E12: Economic Seminar (wiki: Pygmalien, Day 3-5) được bày cho Pygmalien ngày 3-5, không ngày 6', [es > 0, es2], [true, 0]);
  });
  block('E15 Tincture / Form', () => {
    const run = fresh('Mak', 1, 4); run.level = 6; enterEv(run, 'Regenerative Tincture');
    eq('E15 (wiki Regenerative Tincture "Gain Regeneration equal to your level"): cấp 6 → Regen +6 (cũ 12); Form không ra ngày 5-6 ("Day 7+")',
      [run.pattrs.HealthRegen, seenIn(['Form'], [5, 6], 400, 'Vanessa').Form], [6, 0]);
  });
}
function St0() { return R.ENCOUNTERS.step; }

if (!ONLY || ONLY === 'rules') rules();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4') pha4();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4') fixes();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4' || ONLY === 'fix6') fix6();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4' || ONLY === 'fix8') fix8();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4' || ONLY === 'fix9') fix9();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4' || ONLY === 'fix9b') fix9b();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4' || ONLY === 'fix9c') fix9c();
if (!ONLY || ONLY === 'rules' || ONLY === 'pha4' || ONLY === 'fix9d') fix9d();
if (!ONLY || ONLY === 'det') determinism();
if (!ONLY || ONLY === 'sweep') sweep();
console.log('\n' + pass + ' ok, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
