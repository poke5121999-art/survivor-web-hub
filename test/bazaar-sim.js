/*
 * Chợ Phiên (games/bazaar) — kiểm bộ mô phỏng combat js/sim/* bằng Node, không cần trình duyệt.
 * Chạy:  node test/bazaar-sim.js            (mọi phần)
 *        ONLY=micro|cards|ench|monsters|show  chỉ chạy một phần;  QUICK=1 bớt phần quét (mỗi thẻ một bậc, quái ±0 cấp)
 *
 * 1. Trận vi mô tính tay (thẻ tổng hợp đăng ký vào BZSim.extraCards, không lấy từ chính sim):
 *    khung 50 ms, t = biến vòng lặp i của BazaarCardDealer.cs:4073. Thẻ cooldown 5000: mỗi khung +50 → lần thứ 100 (i = 4950)
 *    đủ 5000 → bắn ở t=4950; hiệu ứng vào hàng đợi, chạy khung sau → sát thương ở t=5000; nạp lại từ 0 → bắn 9950, đánh 10000 …
 *    100 máu / 10 → phát thứ 10 ở t=50000, kiểm chết cùng khung → endMs 50000.
 *    Hiệu ứng OnFightStarted vào hàng đợi ở t=0, chạy ở t=50 (sau lượt thẻ của khung 50), nên Haste/Slow/Freeze bắt đầu
 *    đếm lùi từ khung t=100: 2000 ms = 40 khung, khung t=100..2000 còn hiệu lực (39 khung), t=2050 về 0.
 *    Haste ×2: 2 khung đầu 100 + 39×100 = 4000 ở t=2000, còn 1000 = 20 khung → bắn t=3000.
 *    Slow ×0,5: 100 + 39×25 = 1075 → còn 3925 → 79 khung → bắn t=2050+78×50 = 5950.
 *    Freeze ×0: 100 → còn 4900 = 98 khung → bắn t=2050+97×50 = 6900.
 *    Trần 1/20: cooldown 1500 bị Haste: +75/khung (không phải 100): 100 + 19×75 = 1525 ≥ 1500 → bắn t=100+18×50 = 1000 (không trần: 750).
 *    Bỏng 10 áp ở t=50, nổ mỗi 500 ms, giảm max(1, round(3 %)) = 1 mỗi lần: t=500..5000 → 10,9,…,1 = 55.
 *    Bỏng gặp khiên 15: khiên gánh ceil(b/2): 5 (khiên 10), 5 (khiên 5), 4 (khiên 1), rồi 7 → nửa 4, khiên 1, dư 3 → máu −6.
 *    Độc 7 áp ở t=50, nổ t=1000, 2000, 3000 → máu −21, khiên 100 nguyên vẹn.
 *    Khiên 15 + súng 10: phát 1 (t=5000) khiên 15→5 máu 100; phát 2 (t=10000) khiên 5→0, máu 95.
 *    Trong một khung, hàng đợi chạy theo thứ tự xếp: bàn 0 trước bàn 1 (lượt thẻ duyệt bàn 0 trước).
 * 2. Quét phủ: MỌI thẻ trong BZ_CARDS ở MỌI bậc nó có (và mỗi enchantment ở bậc khởi điểm) đặt giữa hai hàng xóm, đấu
 *    bù nhìn có đồ trong 30 s; mọi quái đấu mọi quái cùng cấp ±1 (120 s). Không lỗi, không ngoại lệ. In unknownTypes.
 * 3. In vài trận quái thật dạng dòng thời gian để soát số.
 */
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'games/bazaar/data/cards.js'));
require(path.join(ROOT, 'games/bazaar/data/monsters.js'));
require(path.join(ROOT, 'games/bazaar/data/mode.js'));
const BZ = require(path.join(ROOT, 'games/bazaar/js/sim/index.js'));
const ONLY = process.env.ONLY || '';
const QUICK = !!process.env.QUICK;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '  → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
}
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); }

// ---------- thẻ tổng hợp ----------
const SELF = { $type: 'TTargetCardSelf' };
const OPP = { $type: 'TTargetPlayerRelative', TargetMode: 'Opponent' };
const ME = { $type: 'TTargetPlayerRelative', TargetMode: 'Self' };
function item(id, attrs, abilities, extra) {
  const ab = {}, ids = [];
  abilities.forEach((a, i) => { ab[String(i)] = Object.assign({ Id: String(i), ActiveIn: 'HandOnly', Priority: 'Medium' }, a); ids.push(String(i)); });
  return Object.assign({ $type: 'TCardItem', Type: 'Item', Id: id, InternalName: id, StartingTier: 'Bronze', Size: 'Small', Heroes: ['Common'],
    Tags: [], HiddenTags: [], Localization: { Title: { Text: id }, Tooltips: [] }, Abilities: ab, Auras: {},
    Tiers: { Bronze: { Attributes: attrs, AbilityIds: ids, AuraIds: [], TooltipIds: [] } } }, extra || {});
}
const FIRE = { $type: 'TTriggerOnCardFired' };
const START = { $type: 'TTriggerOnFightStarted' };
BZ.extraCards = {
  gun: item('gun', { CooldownMax: 5000, DamageAmount: 10, Multicast: 1 }, [{ Trigger: FIRE, Action: { $type: 'TActionPlayerDamage', Target: OPP } }]),
  gun1500: item('gun1500', { CooldownMax: 1500, DamageAmount: 1, Multicast: 1 }, [{ Trigger: FIRE, Action: { $type: 'TActionPlayerDamage', Target: OPP } }]),
  critgun: item('critgun', { CooldownMax: 5000, DamageAmount: 10, Multicast: 1, CritChance: 100 }, [{ Trigger: FIRE, Action: { $type: 'TActionPlayerDamage', Target: OPP } }]),
  ammogun: item('ammogun', { CooldownMax: 2000, DamageAmount: 1, Multicast: 1, AmmoMax: 2 }, [{ Trigger: FIRE, Action: { $type: 'TActionPlayerDamage', Target: OPP } }]),
  multigun: item('multigun', { CooldownMax: 4000, DamageAmount: 3, Multicast: 2 }, [{ Trigger: FIRE, Action: { $type: 'TActionPlayerDamage', Target: OPP } }]),
  icer: item('icer', { CooldownMax: 3000, Multicast: 3, FreezeAmount: 1000, FreezeTargets: 1 },
    [{ Trigger: FIRE, Action: { $type: 'TActionCardFreeze', Target: { $type: 'TTargetCardRandom', TargetSection: 'OpponentHand' } } }]),
  lifegun: item('lifegun', { CooldownMax: 5000, DamageAmount: 10, Multicast: 1, Lifesteal: 100 }, [{ Trigger: FIRE, Action: { $type: 'TActionPlayerDamage', Target: OPP } }]),
  rock: item('rock', {}, []),
  hasteall: item('hasteall', { HasteAmount: 2000, HasteTargets: 1 }, [{ Trigger: START, Action: { $type: 'TActionCardHaste', Target: { $type: 'TTargetCardSection', TargetSection: 'SelfHand', ExcludeSelf: true } } }]),
  haste10: item('haste10', { HasteAmount: 10000, HasteTargets: 1 }, [{ Trigger: START, Action: { $type: 'TActionCardHaste', Target: { $type: 'TTargetCardSection', TargetSection: 'SelfHand', ExcludeSelf: true } } }]),
  slowall: item('slowall', { SlowAmount: 2000, SlowTargets: 1 }, [{ Trigger: START, Action: { $type: 'TActionCardSlow', Target: { $type: 'TTargetCardSection', TargetSection: 'SelfHand', ExcludeSelf: true } } }]),
  freezeall: item('freezeall', { FreezeAmount: 2000, FreezeTargets: 1 }, [{ Trigger: START, Action: { $type: 'TActionCardFreeze', Target: { $type: 'TTargetCardSection', TargetSection: 'SelfHand', ExcludeSelf: true } } }]),
  burner: item('burner', { BurnApplyAmount: 10 }, [{ Trigger: START, Action: { $type: 'TActionPlayerBurnApply', Target: OPP } }]),
  poisoner: item('poisoner', { PoisonApplyAmount: 7 }, [{ Trigger: START, Action: { $type: 'TActionPlayerPoisonApply', Target: OPP } }]),
  shield15: item('shield15', { ShieldApplyAmount: 15 }, [{ Trigger: START, Action: { $type: 'TActionPlayerShieldApply', Target: ME } }]),
  shield100: item('shield100', { ShieldApplyAmount: 100 }, [{ Trigger: START, Action: { $type: 'TActionPlayerShieldApply', Target: ME } }]),
  // aura: +5 sát thương cho thẻ kề (TTargetCardPositional Neighbor) — kiểm tổng hợp aura + vị trí
  whet: item('whet', {}, [], { Auras: { a: { Id: 'a', ActiveIn: 'HandOnly', Action: { $type: 'TAuraActionCardModifyAttribute', AttributeType: 'DamageAmount', Operation: 'Add', Value: { $type: 'TFixedValue', Value: 5 }, Target: { $type: 'TTargetCardPositional', TargetMode: 'Neighbor' } } } },
    Tiers: { Bronze: { Attributes: {}, AbilityIds: [], AuraIds: ['a'], TooltipIds: [] } } })
};
let uidN = 0;
function card(id, socket, extra) { return Object.assign({ uid: 'u' + (uidN++), id, tier: 'Bronze', ench: null, socket, size: 1, owner: 0, section: 'hand' }, extra || {}); }
function board(name, hp, cards) { return { name, hero: null, level: 1, healthMax: hp, cards }; }
function evs(r, type, filter) { const o = []; r.frames.forEach(f => f.ev.forEach(e => { if (e.type === type && (!filter || filter(e))) o.push(e); })); return o; }
function frameAt(r, t) { return r.frames.find(f => f.t === t); }
function fireTimes(r, uid) { return evs(r, 'fire', e => e.src === uid).map(e => e.t); }

function micro() {
  console.log('\n# Trận vi mô tính tay');
  BZ.resetStats();
  // súng 5 s / 10 sát thương vs bù nhìn 100 máu
  let g = card('gun', 3);
  let r = BZ.run({ boards: [board('A', 100, [g]), board('Dummy', 100, [])], seed: 1, sandstorm: false });
  eq('súng 5s: thời điểm bắn', fireTimes(r, g.uid), [4950, 9950, 14950, 19950, 24950, 29950, 34950, 39950, 44950, 49950]);
  eq('súng 5s: thời điểm trúng', evs(r, 'damage').map(e => e.t), [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000]);
  eq('súng 5s: thắng/kết thúc', [r.winner, r.endMs], [0, 50000]);
  eq('súng 5s: tiến độ cooldown ở t=2450 (2500/5000)', frameAt(r, 2450).c[0][0], 0.5);

  // Haste / Slow / Freeze / trần 1/20
  [['hasteall', 3000], ['slowall', 5950], ['freezeall', 6900]].forEach(([buff, want]) => {
    const gg = card('gun', 3);
    const rr = BZ.run({ boards: [board('A', 1000, [card(buff, 2), gg]), board('Dummy', 1000, [])], seed: 1, sandstorm: false, maxMs: 8000 });
    eq(buff + ': lần bắn đầu', fireTimes(rr, gg.uid)[0], want);
  });
  {
    const gg = card('gun1500', 3);
    const rr = BZ.run({ boards: [board('A', 1000, [card('haste10', 2), gg]), board('Dummy', 1000, [])], seed: 1, sandstorm: false, maxMs: 3000 });
    eq('trần 1/20: cooldown 1500 bị Haste bắn ở t=1000 (không 750)', fireTimes(rr, gg.uid)[0], 1000);
    eq('trần 1/20: lần hai sau 20 khung nữa (t=2000)', fireTimes(rr, gg.uid)[1], 2000);
  }
  {
    const gg = card('gun', 3);
    const rr = BZ.run({ boards: [board('A', 1000, [card('hasteall', 2), gg]), board('Dummy', 1000, [])], seed: 1, sandstorm: false, maxMs: 3000 });
    eq('Haste còn lại trong khung (áp ở t=50, t=1000: 2000 − 19×50)', frameAt(rr, 1000).c[1][2], 1050);
  }

  // Bỏng: 10 áp ở t=50, nổ mỗi 500 ms, giảm 1 mỗi lần
  r = BZ.run({ boards: [board('A', 1000, [card('burner', 3)]), board('Dummy', 100, [])], seed: 1, sandstorm: false, maxMs: 6000 });
  const burns = evs(r, 'damage', e => e.kind === 'Burn');
  eq('bỏng: thời điểm nổ', burns.map(e => e.t), [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000]);
  eq('bỏng: lượng mỗi lần (giảm 3 %, tối thiểu 1)', burns.map(e => e.hp), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  eq('bỏng: máu còn ở t=5950', frameAt(r, 5950).p[1][0], 45);
  // Bỏng gặp khiên: khiên gánh nửa
  r = BZ.run({ boards: [board('A', 1000, [card('burner', 3)]), board('Dummy', 100, [card('shield15', 3)])], seed: 1, sandstorm: false, maxMs: 2600 });
  eq('bỏng + khiên: [khiên gánh, máu mất]', evs(r, 'damage', e => e.kind === 'Burn').map(e => [e.shield, e.hp]), [[5, 0], [5, 0], [4, 0], [1, 6], [0, 6]]);
  // Độc: mỗi 1000 ms, bỏ qua khiên
  r = BZ.run({ boards: [board('A', 1000, [card('poisoner', 3)]), board('Dummy', 100, [card('shield100', 3)])], seed: 1, sandstorm: false, maxMs: 3500 });
  eq('độc: thời điểm nổ', evs(r, 'damage', e => e.kind === 'Poison').map(e => e.t), [1000, 2000, 3000]);
  eq('độc: [máu, khiên] ở t=3000', frameAt(r, 3000).p[1].slice(0, 2), [79, 100]);
  // Khiên chặn sát thương rồi phần dư vào máu
  r = BZ.run({ boards: [board('A', 1000, [card('gun', 3)]), board('Dummy', 100, [card('shield15', 3)])], seed: 1, sandstorm: false, maxMs: 10500 });
  eq('khiên: [máu, khiên] sau phát 1 (t=5000)', frameAt(r, 5000).p[1].slice(0, 2), [100, 5]);
  eq('khiên: [máu, khiên] sau phát 2 (t=10000)', frameAt(r, 10000).p[1].slice(0, 2), [95, 0]);
  // Multicast: 2 lượt mỗi lần bắn, cùng khung
  r = BZ.run({ boards: [board('A', 1000, [card('multigun', 3)]), board('Dummy', 100, [])], seed: 1, sandstorm: false, maxMs: 4100 });
  eq('multicast 2: hai phát cùng khung t=4000', evs(r, 'damage').map(e => [e.t, e.amt]), [[4000, 3], [4000, 3]]);
  // Multicast chọn lại đích ngẫu nhiên mỗi lượt: 3 lượt đóng băng ngẫu nhiên trên 3 món đối thủ
  {
    const ic = card('icer', 3), opp = [card('gun', 0), card('gun', 1), card('gun', 2)];
    const rr = BZ.run({ boards: [board('A', 1000, [ic]), board('B', 10000, opp)], seed: 12345, sandstorm: false, maxMs: 30000 });
    const fz = evs(rr, 'freeze', e => e.src === ic.uid), byT = {};
    fz.forEach(e => { (byT[e.t] = byT[e.t] || []).push(e.target); });
    const groups = Object.values(byT);
    check('multicast 3: mỗi lần bắn đúng 3 lượt đóng băng', groups.length >= 9 && groups.every(g2 => g2.length === 3), groups.map(g2 => g2.length));
    check('multicast 3: đích chọn lại mỗi lượt (có lần bắn trúng ≥2 món khác nhau)', groups.some(g2 => new Set(g2).size > 1), groups);
    check('multicast 3: không bao giờ đóng băng món không có trong tay đối thủ', fz.every(e => opp.some(o => o.uid === e.target)), fz);
  }
  // Đạn: 2 viên thì chỉ bắn 2 lần, sau đó tiến độ đứng ở 0
  {
    const ag = card('ammogun', 3);
    const rr = BZ.run({ boards: [board('A', 1000, [ag]), board('Dummy', 100, [])], seed: 1, sandstorm: false, maxMs: 10000 });
    eq('đạn 2: chỉ bắn ở t=1950, 3950', fireTimes(rr, ag.uid), [1950, 3950]);
    eq('đạn 2: [tiến độ, đạn] ở t=9950', frameAt(rr, 9950).c[0].slice(0, 2), [0, 0]);
  }
  // Chí mạng: CritChance 100 → luôn chí mạng, ×2
  r = BZ.run({ boards: [board('A', 1000, [card('critgun', 3)]), board('Dummy', 100, [])], seed: 99, sandstorm: false, maxMs: 10100 });
  eq('chí mạng 100 %: [lượng, crit] mỗi phát', evs(r, 'damage').map(e => [e.amt, e.crit]), [[20, true], [20, true]]);
  // Hút máu (Lifesteal 100): hồi bằng sát thương, kẹp ở máu tối đa
  // A mất 1 ở t=2000 và 4000 (súng đạn của B) → 98; t=5000 A đánh 10, hồi 2 (8 tràn) → 100
  r = BZ.run({ boards: [board('A', 100, [card('lifegun', 3)]), board('B', 1000, [card('ammogun', 3)])], seed: 1, sandstorm: false, maxMs: 5100 });
  eq('hút máu: [máu A ở t=4950, t=5000]', [frameAt(r, 4950).p[0][0], frameAt(r, 5000).p[0][0]], [98, 100]);
  eq('hút máu: sự kiện hồi [lượng, tràn]', evs(r, 'heal', e => e.kind === 'Lifesteal').map(e => [e.amt, e.over]), [[2, 8]]);
  // Aura vị trí: đá mài cạnh súng → súng 15 sát thương
  r = BZ.run({ boards: [board('A', 1000, [card('whet', 2), card('gun', 3)]), board('Dummy', 100, [])], seed: 1, sandstorm: false, maxMs: 5100 });
  eq('aura kề bên +5: phát đầu 15', evs(r, 'damage').map(e => e.amt), [15]);
  eq('BZSim.attrs: DamageAmount của súng cạnh đá mài', BZ.attrs(card('gun', 3, { uid: 'gx' }), { board: board('A', 1, [card('whet', 2), card('gun', 3, { uid: 'gx' })]) }).DamageAmount, 15);
  // Cùng chết một khung → bàn 0 thắng (đối thủ được kiểm trước)
  r = BZ.run({ boards: [board('A', 10, [card('gun', 3)]), board('B', 10, [card('gun', 3)])], seed: 1, sandstorm: false });
  eq('cùng chết: bàn 0 thắng ở t=5000', [r.winner, r.endMs], [0, 5000]);
  // Hết giờ = hoà
  r = BZ.run({ boards: [board('A', 10, []), board('B', 10, [])], seed: 1, sandstorm: false, maxMs: 2000 });
  eq('hết giờ: hoà', [r.winner, r.endMs], ['draw', 2000]);
  // Bão cát [ĐỀ XUẤT]: 1 sát thương ở t=30000 cho cả hai, nhịp 900, 800 … sàn 200 rồi tăng dần
  r = BZ.run({ boards: [board('A', 100000, []), board('B', 100000, [])], seed: 1, maxMs: 32000 });
  eq('bão cát: các lần đánh bàn 0 tới t=32000', evs(r, 'damage', e => e.kind === 'Sandstorm' && e.target === 'p0').map(e => e.t), [30000, 30900, 31700]);
  // Tất định
  const A = BZ.boardFromMonster(globalThis.BZ_MONSTERS.find(m => m.InternalName === 'Flame Juggler'), 'a');
  const B = BZ.boardFromMonster(globalThis.BZ_MONSTERS.find(m => m.Encounters.length && m.Player.Attributes.Level === 7 && m.InternalName !== 'Flame Juggler'), 'b');
  const r1 = JSON.stringify(BZ.run({ boards: [A, B], seed: 42 })), r2 = JSON.stringify(BZ.run({ boards: [A, B], seed: 42 }));
  check('cùng seed → bản phát lại giống hệt (' + r1.length + ' byte)', r1 === r2, 'khác');
  let differ = 0;
  for (let s = 1; s <= 20; s++) if (JSON.stringify(BZ.run({ boards: [A, B], seed: s }).frames) !== JSON.stringify(BZ.run({ boards: [A, B], seed: 42 }).frames)) differ++;
  console.log('       (seed khác cho bản phát lại khác: ' + differ + '/20 seed — thẻ ngẫu nhiên mới khác)');
  // cardText
  const pistol = Object.values(globalThis.BZ_CARDS).find(c => c.InternalName === 'Tracer Pistol');
  eq('cardText Tracer Pistol (Diamond, Heavy)', BZ.cardText({ uid: 'tp', id: pistol.Id, tier: 'Diamond', ench: 'Heavy', socket: 0, size: 2, section: 'hand' }).map(l => l.text),
    ['Deal 50 Damage', 'When you Crit, Reload this 1 Ammo', 'Slow an item for 1 second(s)']);
  check('micro: không lỗi giữa trận', BZ.errors.length === 0, BZ.errors.slice(0, 5));
  check('micro: không gặp $type lạ', Object.keys(BZ.unknownTypes).length === 0, BZ.unknownTypes);
}

// ---------- quét phủ ----------
function dummyBoard() { // bù nhìn có đồ để hành động nhắm món đối thủ có đích
  return board('Dummy', 1000000, [card('gun', 0), card('rock', 1), card('gun1500', 2), card('ammogun', 3)]);
}
function sweepCards(withEnch) {
  const ids = Object.keys(globalThis.BZ_CARDS);
  let runs = 0, bad = 0, fires = 0;
  const t0 = Date.now();
  for (const id of ids) {
    const tpl = globalThis.BZ_CARDS[id];
    const size = BZ.SIZE[tpl.Size] || 1;
    let combos = [];
    if (!withEnch) combos = Object.keys(tpl.Tiers || {}).map(t => [t, null]);
    else combos = Object.keys(tpl.Enchantments || {}).map(e => [tpl.StartingTier, e]);
    if (QUICK && !withEnch) combos = combos.slice(0, 1);
    for (const [tier, ench] of combos) {
      const isSkill = tpl.$type === 'TCardSkill';
      const me = [card('gun', 0), card('ammogun', 1)];
      me.push(card(id, 2, { tier, ench, size, section: isSkill ? 'skills' : 'hand' }));
      me.push(card('gun1500', isSkill ? 2 : 2 + size), card('rock', isSkill ? 3 : 3 + size));
      const errBefore = BZ.errors.length;
      let r;
      try { r = BZ.run({ boards: [board('Me', 2000, me), dummyBoard()], seed: runs + 1, maxMs: 30000, frames: false }); }
      catch (e) { bad++; console.log('  NÉM: ' + tpl.InternalName + ' ' + tier + ' ' + ench + ': ' + e.stack); continue; }
      runs++;
      fires += r.frames.reduce((n, f) => n + f.ev.filter(e => e.type === 'fire').length, 0);
      if (r.fatal || BZ.errors.length > errBefore) {
        bad++;
        if (bad <= 8) console.log('  LỖI: ' + tpl.InternalName + ' ' + tier + ' ' + (ench || '') + ': ' + (r.fatal || BZ.errors.slice(errBefore, errBefore + 2).join(' | ')));
      }
    }
  }
  check((withEnch ? 'quét enchantment' : 'quét thẻ × bậc') + ': ' + runs + ' trận 30 s, ' + fires + ' lần bắn, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', bad === 0, bad + ' trận lỗi');
}
function sweepMonsters() {
  const ms = globalThis.BZ_MONSTERS.filter(m => (m.Player.Hand.Items || []).length);
  let runs = 0, bad = 0, wins = [0, 0, 0];
  const t0 = Date.now();
  const span = QUICK ? 0 : 1;
  for (let i = 0; i < ms.length; i++) for (let j = 0; j < ms.length; j++) {
    if (i === j) continue;
    const la = ms[i].Player.Attributes.Level, lb = ms[j].Player.Attributes.Level;
    if (Math.abs(la - lb) > span) continue;
    const errBefore = BZ.errors.length;
    let r;
    try { r = BZ.run({ boards: [BZ.boardFromMonster(ms[i], 'a'), BZ.boardFromMonster(ms[j], 'b')], seed: i * 1000 + j, frames: false }); }
    catch (e) { bad++; console.log('  NÉM: ' + ms[i].InternalName + ' vs ' + ms[j].InternalName + ': ' + e.stack); continue; }
    runs++;
    wins[r.winner === 'draw' ? 2 : r.winner]++;
    if (r.fatal || BZ.errors.length > errBefore) {
      bad++;
      if (bad <= 8) console.log('  LỖI: ' + ms[i].InternalName + ' vs ' + ms[j].InternalName + ': ' + (r.fatal || BZ.errors.slice(errBefore, errBefore + 2).join(' | ')));
    }
  }
  check('quét quái cùng cấp ±' + span + ': ' + runs + ' trận (thắng bàn 0/bàn 1/hoà ' + wins.join('/') + '), ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', bad === 0, bad + ' trận lỗi');
}
function reportUnknown() {
  const u = Object.entries(BZ.unknownTypes).sort((a, b) => b[1] - a[1]);
  console.log('\n# unknownTypes: ' + u.length + ' loại' + (u.length ? '' : ' (không có)'));
  u.slice(0, 15).forEach(([k, n]) => console.log('   ' + n + '  ' + k));
  const ap = Object.entries(BZ.approx);
  if (ap.length) console.log('# đã biết nhưng xấp xỉ (dữ liệu bị máy chủ xoá): ' + ap.map(([k, n]) => k + ' ×' + n).join(', '));
  const ran = Object.entries(BZ.ran).sort((a, b) => b[1] - a[1]);
  console.log('# hành động đã chạy (' + ran.length + ' loại): ' + ran.map(([k, n]) => k.replace(/^TAction/, '') + ' ' + n).join(', '));
  const never = Object.keys(BZ.ACTIONS).filter(k => !BZ.ran[k]);
  console.log('# hành động đã cài nhưng chưa chạy lần nào: ' + (never.join(', ') || '(không)'));
  // chỉ tính lạ là lỗi khi $type thuộc DSL (template thiếu = thẻ quái test không có trong DB)
  const dsl = u.filter(([k]) => !k.startsWith('template:'));
  check('không còn $type DSL nào chưa cài', dsl.length === 0, dsl.slice(0, 10));
}

function show() {
  console.log('\n# Vài trận quái thật (dòng thời gian rút gọn)');
  const M = n => globalThis.BZ_MONSTERS.find(m => m.InternalName === n);
  const pairs = [['Fanged Inglet', 'Banannibal'], ['Boarrior', 'Covetous Thief'], ['Flame Juggler', 'Not a Spy'], ['Wildman', 'Outlands Terror (Monster)']];
  for (const [a, b] of pairs) {
    const ma = M(a), mb = M(b);
    if (!ma || !mb) { console.log('  (thiếu ' + a + ' / ' + b + ')'); continue; }
    const A = BZ.boardFromMonster(ma, 'a'), B = BZ.boardFromMonster(mb, 'b');
    const r = BZ.run({ boards: [A, B], seed: 7 });
    const name = {}; r.cards.forEach(c => { name[c.uid] = globalThis.BZ_CARDS[c.id].InternalName; });
    console.log('\n  ' + A.name + ' (' + A.healthMax + ' máu, ' + A.cards.length + ' thẻ) vs ' + B.name + ' (' + B.healthMax + ' máu, ' + B.cards.length + ' thẻ)'
      + ' → ' + (r.winner === 'draw' ? 'hoà' : (r.winner === 0 ? A.name : B.name) + ' thắng') + ' ở ' + (r.endMs / 1000) + ' s');
    const tot = [{}, {}];
    r.frames.forEach(f => f.ev.forEach(e => {
      const side = e.src != null ? (r.cards.find(c => c.uid === e.src) || {}).owner : null;
      if (side == null) return;
      const k = e.type === 'damage' ? 'dmg' : e.type;
      tot[side][k] = (tot[side][k] || 0) + (e.amt || (e.type === 'fire' ? 1 : 0));
    }));
    console.log('   tổng bàn 0: ' + JSON.stringify(tot[0]) + '\n   tổng bàn 1: ' + JSON.stringify(tot[1]));
    let lines = 0;
    for (const f of r.frames) {
      if (f.t % 5000 !== 0 && f !== r.frames[r.frames.length - 1]) continue;
      const fires = []; f.ev.forEach(e => { if (e.type === 'fire') fires.push(name[e.src]); });
      console.log('   t=' + String(f.t / 1000).padStart(5) + 's  máu/khiên/bỏng/độc  ' + f.p.map(p => p[0] + '/' + p[1] + '/' + p[2] + '/' + p[3]).join('  vs  '));
      if (++lines > 26) break;
    }
  }
}

if (!ONLY || ONLY === 'micro') micro();
BZ.ran = {};
if (!ONLY || ONLY === 'cards') { console.log('\n# Quét thẻ'); sweepCards(false); }
if (!ONLY || ONLY === 'ench') { console.log('\n# Quét enchantment'); sweepCards(true); }
if (!ONLY || ONLY === 'monsters') { console.log('\n# Quét quái'); sweepMonsters(); }
if (!ONLY || ONLY !== 'micro') reportUnknown();
if (!ONLY || ONLY === 'show') show();
console.log('\n' + pass + ' đạt, ' + fail + ' trượt');
process.exit(fail ? 1 : 0);
