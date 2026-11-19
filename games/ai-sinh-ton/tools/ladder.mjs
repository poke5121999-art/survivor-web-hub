// Runs the equipment merge ladder from grey items up to Thần Thoại and checks the counts of the owner's chart.
// Usage: node games/ai-sinh-ton/tools/ladder.mjs
import { TIERS, ITEMS, ITEM, baseWorth, merge, mergeProblem, autoMergePlan, refundOf } from '../js/data/equip.js';

const fails = [];
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };

const CHART = [1, 3, 9, 27, 54, 108, 216, 432, 864, 1728, 3456];
const NEED = [3, 3, 3, 2, 2, 2, 2, 2, 2, 2];
check(TIERS.length === 11, `the ladder has 11 tiers (${TIERS.length})`);
for (let t = 0; t < TIERS.length; t++) check(baseWorth(t) === CHART[t], `${TIERS[t].name} is worth ${CHART[t]} grey items (${baseWorth(t)})`);
for (let t = 0; t < 10; t++) check(TIERS[t].need === NEED[t], `step ${t + 1}: ${NEED[t]} x ${TIERS[t].name} -> 1 ${TIERS[t + 1].name}`);
check(baseWorth(6) === 8 * baseWorth(3), 'Huyền Thoại = 8 Sử Thi');
check(baseWorth(10) === 16 * baseWorth(6) && baseWorth(10) === 128 * baseWorth(3), 'Thần Thoại = 16 Huyền Thoại = 128 Sử Thi');

// build one Thần Thoại weapon by really merging 3456 grey items and count what was consumed
let uid = 0; let consumed = 0;
const grey = (item) => { consumed++; return { uid: ++uid, item, tier: 0, lv: 1 }; };
const other = ITEMS.find((i) => i.slot === 'weapon' && i.id !== 'w_cua').id;
function build(tier, item) {
  if (tier === 0) return grey(item);
  const T = TIERS[tier - 1];
  const main = build(tier - 1, item);
  const fodder = [];
  for (let k = 1; k < T.need; k++) fodder.push(build(tier - 1, T.exact ? item : other));
  return merge(main, fodder).item;
}
const red = build(10, 'w_cua');
check(red.tier === 10 && red.item === 'w_cua', 'merging up the ladder ends on a Thần Thoại Cưa Xích Cũ');
check(consumed === 3456, `it consumed 3456 grey items (${consumed})`);

const a = { uid: 1, item: 'w_cua', tier: 0, lv: 1 };
check(mergeProblem(a, [{ uid: 2, item: 'w_no', tier: 0, lv: 1 }, { uid: 3, item: 'w_cua', tier: 0, lv: 1 }]) === 'khác món', 'grey merge refuses a different item');
check(mergeProblem(a, [{ uid: 2, item: 'w_cua', tier: 1, lv: 1 }, { uid: 3, item: 'w_cua', tier: 0, lv: 1 }]) === 'khác bậc', 'merge refuses a different tier');
check(mergeProblem(a, [{ uid: 1, item: 'w_cua', tier: 0, lv: 1 }, { uid: 3, item: 'w_cua', tier: 0, lv: 1 }]) === 'trùng món chính', 'merge refuses the main piece as its own fodder');
const p = { uid: 9, item: 'w_cua', tier: 3, lv: 12 };
check(mergeProblem(p, [{ uid: 10, item: 'w_no', tier: 3, lv: 1 }]) === null, 'Sử Thi takes any Sử Thi of the same slot as fodder');
check(mergeProblem(p, [{ uid: 10, item: 'a_lop', tier: 3, lv: 1 }]) === 'khác ô', 'Sử Thi refuses fodder of another slot');
check(mergeProblem(red, [{ uid: 10, item: 'w_no', tier: 10, lv: 1 }]) === 'bậc cao nhất', 'Thần Thoại cannot be merged further');
const m = merge(p, [{ uid: 10, item: 'w_no', tier: 3, lv: 7 }]);
const r7 = refundOf(7);
check(m.item.lv === 12 && m.item.tier === 4 && m.item.uid === 9, 'the main piece keeps its level and identity');
check(m.refund.gold === r7.gold && m.refund.mats === r7.mats && r7.gold > 0, `fodder levels are refunded in full (${m.refund.gold} vàng, ${m.refund.mats} bản rèn)`);

// auto merge: 9 grey + 2 green of one item collapse to one blue, 4 Sử Thi are left alone
const bag = [];
for (let i = 0; i < 9; i++) bag.push({ uid: 100 + i, item: 'b_dan', tier: 0, lv: 1 });
for (let i = 0; i < 4; i++) bag.push({ uid: 200 + i, item: 'b_dan', tier: 3, lv: 1 });
let rounds = 0; let live = bag.slice();
for (;;) {
  const plan = autoMergePlan(live, new Set());
  if (!plan.length) break;
  rounds++;
  for (const s of plan) { const gone = new Set(s.fodder.map((f) => f.uid)); live = live.filter((i) => !gone.has(i.uid)).map((i) => (i.uid === s.main.uid ? merge(s.main, s.fodder).item : i)); }
}
const tiers = live.map((i) => i.tier).sort((x, y) => x - y).join(',');
check(tiers === '2,3,3,3,3', `auto merge turns 9 grey into 1 Hiếm and leaves the 4 Sử Thi (${tiers}, ${rounds} rounds)`);
const eq = autoMergePlan([{ uid: 1, item: 'b_dan', tier: 0, lv: 1 }, { uid: 2, item: 'b_dan', tier: 0, lv: 5 }, { uid: 3, item: 'b_dan', tier: 0, lv: 1 }], new Set([2, 3]));
check(eq.length === 0, 'auto merge never eats an equipped piece as fodder');
check(ITEMS.length === 18 && new Set(ITEMS.map((i) => i.slot)).size === 6 && ITEMS.every((i) => i.perks.length === 3 && ITEM[i.id]), '18 items, 3 per slot, 3 perks each');

console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
